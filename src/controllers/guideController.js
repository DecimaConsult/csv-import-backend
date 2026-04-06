import Guide from '../models/Guide.js';
import TimeSlot from '../models/TimeSlot.js';
import ActivityBooking from '../models/ActivityBooking.js';
import User from '../models/User.js';
import PasswordSetupToken from '../models/PasswordSetupToken.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import emailService from '../services/emailService.js';
import calendarService from '../services/calendarService.js';

/**
 * Get all guides with optional availability filtering
 * GET /api/guides
 * Query params:
 *   - date: ISO date string (filter guides available on this date)
 *   - time: Time string in HH:MM format (filter guides available at this time)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getGuides = async (req, res) => {
  try {
    const { date, time } = req.query;

    let query = {};
    
    // If date filter provided, filter by availability
    if (date) {
      const filterDate = new Date(date);
      
      // Find guides who have availability entry for this date with status 'Available'
      query['availability'] = {
        $elemMatch: {
          date: {
            $gte: new Date(filterDate.setHours(0, 0, 0, 0)),
            $lt: new Date(filterDate.setHours(23, 59, 59, 999))
          },
          status: 'Available'
        }
      };
    }

    let guides = await Guide.find(query)
      .populate('userId', 'name email isActive')
      .select('-__v')
      .sort({ guideName: 1 });

    // If time filter is provided, filter guides by time window
    if (date && time) {
      const filterDate = new Date(date);
      filterDate.setHours(0, 0, 0, 0);
      
      // Parse the time (HH:MM format)
      const [hours, minutes] = time.split(':').map(Number);
      const timeInMinutes = hours * 60 + minutes;
      
      // Filter guides whose availability time window includes this time
      guides = guides.filter(guide => {
        // Find availability entry for this date
        const availEntry = guide.availability.find(avail => {
          const availDate = new Date(avail.date);
          availDate.setHours(0, 0, 0, 0);
          return availDate.getTime() === filterDate.getTime() && avail.status === 'Available';
        });
        
        if (!availEntry) return false;
        
        // If no time restrictions set, include the guide
        if (!availEntry.startTime || !availEntry.endTime) return true;
        
        // Check if time falls within the guide's available window
        const [startHour, startMin] = availEntry.startTime.split(':').map(Number);
        const [endHour, endMin] = availEntry.endTime.split(':').map(Number);
        const availableStartInMinutes = startHour * 60 + startMin;
        const availableEndInMinutes = endHour * 60 + endMin;
        
        return timeInMinutes >= availableStartInMinutes && timeInMinutes <= availableEndInMinutes;
      });
    }

    res.status(200).json({
      success: true,
      count: guides.length,
      data: guides
    });
  } catch (error) {
    console.error('Error fetching guides:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guides'
    });
  }
};

/**
 * Get guide's availability array
 * GET /api/guides/:guideId/availability
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getGuideAvailability = async (req, res) => {
  try {
    const { guideId } = req.params;

    // Check authorization: ADMIN can view any guide, GUIDE can only view own data
    if (req.user.role === 'GUIDE') {
      const guide = await Guide.findById(guideId);
      if (!guide) {
        return res.status(404).json({
          success: false,
          error: 'Guide not found'
        });
      }
      
      // Check if this guide belongs to the authenticated user
      if (guide.userId.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own availability'
        });
      }
    }

    const guide = await Guide.findById(guideId)
      .select('guideName email availability')
      .lean();

    if (!guide) {
      return res.status(404).json({
        success: false,
        error: 'Guide not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        guideId: guideId,
        guideName: guide.guideName,
        email: guide.email,
        availability: guide.availability || []
      }
    });
  } catch (error) {
    console.error('Error fetching guide availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guide availability'
    });
  }
};

/**
 * Update guide's availability (add or update availability entry)
 * PUT /api/guides/:guideId/availability
 * Body:
 *   - date: ISO date string (required)
 *   - startTime: Time string (e.g., "09:00") (required)
 *   - endTime: Time string (e.g., "17:00") (required)
 *   - status: "Available" | "Unavailable" | "OnLeave" (required)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const updateGuideAvailability = async (req, res) => {
  try {
    const { guideId } = req.params;
    const { date, startTime, endTime, status } = req.body;

    // Validate required fields
    if (!date || !startTime || !endTime || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: date, startTime, endTime, status'
      });
    }

    // Validate status enum
    const validStatuses = ['Available', 'Unavailable', 'OnLeave'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find guide
    const guide = await Guide.findById(guideId);
    
    if (!guide) {
      return res.status(404).json({
        success: false,
        error: 'Guide not found'
      });
    }

    // Authorization: GUIDE can only update own availability
    if (req.user.role === 'GUIDE' && guide.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own availability'
      });
    }

    // Parse date and normalize to start of day
    const availabilityDate = new Date(date);
    availabilityDate.setHours(0, 0, 0, 0);

    // Check if availability entry already exists for this date
    const existingIndex = guide.availability.findIndex(avail => {
      const availDate = new Date(avail.date);
      availDate.setHours(0, 0, 0, 0);
      return availDate.getTime() === availabilityDate.getTime();
    });

    const newAvailability = {
      date: availabilityDate,
      startTime,
      endTime,
      status,
      createdAt: new Date()
    };

    if (existingIndex !== -1) {
      // Update existing entry
      guide.availability[existingIndex] = newAvailability;
    } else {
      // Add new entry
      guide.availability.push(newAvailability);
    }

    // Sort availability by date (most recent first)
    guide.availability.sort((a, b) => b.date - a.date);

    await guide.save();

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: {
        guideId: guide._id,
        guideName: guide.guideName,
        availability: guide.availability
      }
    });
  } catch (error) {
    console.error('Error updating guide availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update guide availability'
    });
  }
};

/**
 * Delete guide's availability entry for a specific date
 * DELETE /api/guides/:guideId/availability/:date
 * Params:
 *   - guideId: MongoDB ObjectId of the guide
 *   - date: ISO date string
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const deleteGuideAvailability = async (req, res) => {
  try {
    const { guideId, date } = req.params;

    // Find guide
    const guide = await Guide.findById(guideId);
    
    if (!guide) {
      return res.status(404).json({
        success: false,
        error: 'Guide not found'
      });
    }

    // Authorization: GUIDE can only delete own availability
    if (req.user.role === 'GUIDE' && guide.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own availability'
      });
    }

    // Parse date and normalize to start of day
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Find and remove the availability entry for this date
    const initialLength = guide.availability.length;
    guide.availability = guide.availability.filter(avail => {
      const availDate = new Date(avail.date);
      availDate.setHours(0, 0, 0, 0);
      return availDate.getTime() !== targetDate.getTime();
    });

    if (guide.availability.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'No availability entry found for this date'
      });
    }

    await guide.save();

    res.status(200).json({
      success: true,
      message: 'Availability deleted successfully',
      data: {
        guideId: guide._id,
        guideName: guide.guideName,
        availability: guide.availability
      }
    });
  } catch (error) {
    console.error('Error deleting guide availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete guide availability'
    });
  }
};

/**
 * Get guide's assigned tours/slots
 * GET /api/guides/:guideId/assignments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getGuideAssignments = async (req, res) => {
  try {
    const { guideId } = req.params;

    // Find guide
    const guide = await Guide.findById(guideId);
    
    if (!guide) {
      return res.status(404).json({
        success: false,
        error: 'Guide not found'
      });
    }

    // Authorization: GUIDE can only view own assignments
    if (req.user.role === 'GUIDE' && guide.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own assignments'
      });
    }

    // Find all slots assigned to this guide
    const slots = await TimeSlot.find({ assignedGuideId: guideId })
      .sort({ startDateTime: 1 })
      .lean();

    // For each slot, get activity bookings to calculate passenger details
    const slotsWithDetails = await Promise.all(
      slots.map(async (slot) => {
        const activityBookings = await ActivityBooking.find({ 
          slotId: slot._id,
          status: { $ne: 'CANCELLED' }
        })
        .select('totalAdults totalChildren totalInfants totalPassengers confirmationCode')
        .lean();

        // Calculate totals
        const totals = activityBookings.reduce((acc, booking) => {
          acc.totalAdults += booking.totalAdults || 0;
          acc.totalChildren += booking.totalChildren || 0;
          acc.totalInfants += booking.totalInfants || 0;
          acc.totalPassengers += booking.totalPassengers || 0;
          return acc;
        }, {
          totalAdults: 0,
          totalChildren: 0,
          totalInfants: 0,
          totalPassengers: 0
        });

        return {
          slotId: slot._id,
          productId: slot.productId,
          productTitle: slot.productTitle,
          startDateTime: slot.startDateTime,
          endDateTime: slot.endDateTime,
          status: slot.status,
          currentPassengerCount: slot.currentPassengerCount,
          maxCapacity: slot.maxCapacity,
          bookingCount: activityBookings.length,
          passengerBreakdown: {
            adults: totals.totalAdults,
            children: totals.totalChildren,
            infants: totals.totalInfants,
            total: totals.totalPassengers
          },
          isSplitSlot: slot.isSplitSlot,
          parentSlotId: slot.parentSlotId
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        guideId: guide._id,
        guideName: guide.guideName,
        email: guide.email,
        assignmentCount: slotsWithDetails.length,
        assignments: slotsWithDetails
      }
    });
  } catch (error) {
    console.error('Error fetching guide assignments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guide assignments'
    });
  }
};

/**
 * Create a new guide with password setup email
 * POST /api/guides
 * Body: { guideName, email, phoneNumber }
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const createGuide = async (req, res) => {
  try {
    const { guideName, email, phoneNumber, tier, productSpecializations } = req.body;

    // Validate required fields
    if (!guideName || !email) {
      return res.status(400).json({
        success: false,
        error: 'Guide name and email are required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    // Generate temporary password (will be replaced when guide sets up account)
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create user account
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'GUIDE',
      name: guideName
    });

    // Split guideName into firstName and lastName
    const nameParts = guideName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Create guide profile
    const guide = await Guide.create({
      userId: user._id,
      guideName,
      firstName,
      lastName,
      email: email.toLowerCase(),
      phoneNumber: phoneNumber || '',
      tier: tier || 'STANDARD',
      productSpecializations: productSpecializations || [],
      availability: []
    });

    // Generate password setup token
    const setupToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Store token in database
    await PasswordSetupToken.create({
      userId: user._id,
      token: setupToken,
      expiresAt: tokenExpiry
    });

    // Send password setup email
    const emailResult = await emailService.sendPasswordSetupEmail(
      email,
      guideName,
      setupToken
    );

    if (!emailResult.success) {
      console.error('Failed to send setup email:', emailResult.error);
    }

    res.status(201).json({
      success: true,
      data: {
        guide: {
          _id: guide._id,
          guideName: guide.guideName,
          email: guide.email,
          phoneNumber: guide.phoneNumber,
          tier: guide.tier,
          productSpecializations: guide.productSpecializations,
          userId: user._id
        },
        emailSent: emailResult.success
      },
      message: emailResult.success 
        ? 'Guide created successfully. Password setup email sent.'
        : 'Guide created successfully. Email sending failed - please contact the guide manually.'
    });
  } catch (error) {
    console.error('Error creating guide:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create guide'
    });
  }
};

/**
 * Setup password using token from email
 * POST /api/guides/setup-password
 * Body: { token, password }
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const setupPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Find valid token
    const setupToken = await PasswordSetupToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: Date.now() }
    });

    if (!setupToken) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    await User.findByIdAndUpdate(setupToken.userId, {
      password: hashedPassword
    });

    // Mark token as used
    setupToken.used = true;
    await setupToken.save();

    res.status(200).json({
      success: true,
      message: 'Password set successfully. You can now log in.'
    });
  } catch (error) {
    console.error('Error setting up password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set up password'
    });
  }
};

export default {
  getGuides,
  getGuideAvailability,
  updateGuideAvailability,
  deleteGuideAvailability,
  getGuideAssignments,
  createGuide,
  setupPassword
};


/**
 * Update guide tier and product specializations
 * PUT /api/guides/:guideId/profile
 * Body: { tier, productSpecializations }
 */
export const updateGuideProfile = async (req, res) => {
  try {
    const { guideId } = req.params;
    const { tier, productSpecializations } = req.body;

    const guide = await Guide.findById(guideId);
    
    if (!guide) {
      return res.status(404).json({
        success: false,
        error: 'Guide not found'
      });
    }

    // Update tier if provided
    if (tier) {
      const validTiers = ['PREFERRED', 'STANDARD', 'BACKUP'];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({
          success: false,
          error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`
        });
      }
      guide.tier = tier;
    }

    // Update product specializations if provided
    if (productSpecializations !== undefined) {
      if (!Array.isArray(productSpecializations)) {
        return res.status(400).json({
          success: false,
          error: 'productSpecializations must be an array'
        });
      }
      guide.productSpecializations = productSpecializations;
    }

    await guide.save();

    res.status(200).json({
      success: true,
      message: 'Guide profile updated successfully',
      data: {
        guideId: guide._id,
        guideName: guide.guideName,
        tier: guide.tier,
        productSpecializations: guide.productSpecializations
      }
    });
  } catch (error) {
    console.error('Error updating guide profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update guide profile'
    });
  }
};

/**
 * Get guides filtered by product and sorted by tier
 * GET /api/guides/for-assignment
 * Query params:
 *   - productId: Filter by product specialization
 *   - date: ISO date string (for availability check)
 *   - time: Time string in HH:MM format (for availability check)
 *   - startDateTime: ISO datetime for calendar conflict check
 *   - endDateTime: ISO datetime for calendar conflict check
 *   - excludeSlotId: Slot ID to exclude from conflict check (for reassignments)
 */
export const getGuidesForAssignment = async (req, res) => {
  try {
    const { productId, date, time, startDateTime, endDateTime, excludeSlotId } = req.query;

    // Build query
    const query = {};
    
    // Filter by product specialization if provided
    if (productId) {
      query.productSpecializations = productId;
    }

    // Get all matching guides
    let guides = await Guide.find(query)
      .populate('userId', 'name email isBlocked')
      .select('-__v')
      .lean();

    // Filter out blocked users
    guides = guides.filter(guide => !guide.userId?.isBlocked);

    // Check availability for each guide if date provided
    if (date) {
      const filterDate = new Date(date);
      filterDate.setHours(0, 0, 0, 0);
      
      // Check calendar conflicts if datetime range provided
      const checkCalendarConflicts = startDateTime && endDateTime;
      const slotStart = checkCalendarConflicts ? new Date(startDateTime) : null;
      const slotEnd = checkCalendarConflicts ? new Date(endDateTime) : null;
      
      guides = await Promise.all(guides.map(async (guide) => {
        // Find availability entry for this date
        const availEntry = guide.availability?.find(avail => {
          const availDate = new Date(avail.date);
          availDate.setHours(0, 0, 0, 0);
          return availDate.getTime() === filterDate.getTime();
        });

        let availabilityStatus = 'NO_AVAILABILITY_SET';
        let availabilityLabel = 'No Availability Set';
        let isBusy = false;

        if (availEntry) {
          if (availEntry.status === 'Available') {
            // Check time window if time parameter provided
            if (time && availEntry.startTime && availEntry.endTime) {
              const [hours, minutes] = time.split(':').map(Number);
              const timeInMinutes = hours * 60 + minutes;
              
              const [startHour, startMin] = availEntry.startTime.split(':').map(Number);
              const [endHour, endMin] = availEntry.endTime.split(':').map(Number);
              const availableStartInMinutes = startHour * 60 + startMin;
              const availableEndInMinutes = endHour * 60 + endMin;
              
              if (timeInMinutes >= availableStartInMinutes && timeInMinutes <= availableEndInMinutes) {
                availabilityStatus = 'AVAILABLE';
                availabilityLabel = `Available (${availEntry.startTime} - ${availEntry.endTime})`;
              } else {
                availabilityStatus = 'NOT_AVAILABLE_TIME';
                availabilityLabel = `Not Available at this time`;
                isBusy = true;
              }
            } else {
              availabilityStatus = 'AVAILABLE';
              availabilityLabel = 'Available';
            }
          } else if (availEntry.status === 'Unavailable') {
            availabilityStatus = 'UNAVAILABLE';
            availabilityLabel = 'Unavailable';
            isBusy = true;
          } else if (availEntry.status === 'OnLeave') {
            availabilityStatus = 'ON_LEAVE';
            availabilityLabel = 'On Leave';
            isBusy = true;
          }
        }

        // Check for calendar conflicts (other tours or Google Calendar events)
        // Check calendar even if no availability is set - we still want to show conflicts
        if (checkCalendarConflicts && !isBusy) {
          try {
            const calendarCheck = await calendarService.checkGuideAvailability(
              guide.email,
              slotStart,
              slotEnd,
              excludeSlotId,
              true, // Skip time range check since we already checked it above
              productId  // Pass productId for duration lookup and 30min buffer
            );
            
            if (!calendarCheck.available) {
              availabilityStatus = 'BUSY';
              availabilityLabel = calendarCheck.reason || 'Has conflicting bookings';
              isBusy = true;
            } else if (availabilityStatus === 'NO_AVAILABILITY_SET') {
              // If no availability set but calendar is free, show as available
              availabilityStatus = 'AVAILABLE';
              availabilityLabel = 'Available (no conflicts found)';
            }
          } catch (error) {
            console.error(`Error checking calendar for guide ${guide.guideName}:`, error.message);
            // Continue without calendar check
          }
        }

        return {
          ...guide,
          availabilityStatus,
          availabilityLabel,
          isBusy
        };
      }));
    } else {
      // No date provided, set default availability status
      guides = guides.map(guide => ({
        ...guide,
        availabilityStatus: 'NO_AVAILABILITY_SET',
        availabilityLabel: 'No Availability Set',
        isBusy: false
      }));
    }

    // Sort by tier (PREFERRED first, then STANDARD, then BACKUP)
    const tierOrder = { PREFERRED: 1, STANDARD: 2, BACKUP: 3 };
    guides.sort((a, b) => {
      const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
      if (tierDiff !== 0) return tierDiff;
      // Within same tier, sort alphabetically by name
      return a.guideName.localeCompare(b.guideName);
    });

    // Group by tier for frontend
    const groupedGuides = {
      PREFERRED: guides.filter(g => g.tier === 'PREFERRED'),
      STANDARD: guides.filter(g => g.tier === 'STANDARD'),
      BACKUP: guides.filter(g => g.tier === 'BACKUP')
    };

    res.status(200).json({
      success: true,
      data: {
        guides,
        groupedByTier: groupedGuides,
        filters: {
          productId: productId || null,
          date: date || null,
          time: time || null,
          startDateTime: startDateTime || null,
          endDateTime: endDateTime || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching guides for assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guides'
    });
  }
};
