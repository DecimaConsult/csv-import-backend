import TimeSlot from '../models/TimeSlot.js';
import ActivityBooking from '../models/ActivityBooking.js';
import Guide from '../models/Guide.js';
import Product from '../models/Product.js';
import Coordinator from '../models/Coordinator.js';
import mongoose from 'mongoose';
import emailService from '../services/emailService.js';
import calendarService from '../services/calendarService.js';

/**
 * Slot Controller
 * Handles HTTP requests for slot management
 */

/**
 * Get all slots with optional filters
 * GET /api/slots
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSlots = async (req, res) => {
  try {
    const { startDate, endDate, status, productId } = req.query;
    
    // Build query filters
    const filters = {};
    
    // Date range filter
    if (startDate || endDate) {
      filters.startDateTime = {};
      if (startDate) {
        filters.startDateTime.$gte = new Date(startDate);
      }
      if (endDate) {
        filters.startDateTime.$lte = new Date(endDate);
      }
    }
    
    // Status filter
    if (status) {
      filters.status = status;
    }
    
    // Product ID filter
    if (productId) {
      filters.productId = parseInt(productId);
    }
    
    // Query slots with filters
    const slots = await TimeSlot.find(filters)
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .sort({ startDateTime: 1 })
      .lean();
    
    // Return results even if empty
    res.status(200).json({ 
      slots,
      count: slots.length,
      message: slots.length === 0 ? 'No slots found matching the criteria' : undefined
    });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Get slot details by ID with populated bookings
 * GET /api/slots/:slotId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getSlotById = async (req, res) => {
  try {
    const { slotId } = req.params;
    
    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ 
        error: 'Invalid slot ID format' 
      });
    }
    
    // Find slot by ID
    const slot = await TimeSlot.findById(slotId)
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .lean();
    
    if (!slot) {
      return res.status(404).json({ 
        error: 'Slot not found' 
      });
    }
    
    // For guides, verify they are assigned to this slot
    if (req.user.role === 'GUIDE') {
      const guide = await Guide.findOne({ userId: req.user.id });
      
      console.log(`[SlotController] Guide access check:`, {
        userId: req.user.id,
        guideFound: !!guide,
        guideId: guide?._id,
        slotId: slot._id,
        slotAssignedGuideId: slot.assignedGuideId,
        match: guide && slot.assignedGuideId && slot.assignedGuideId.toString() === guide._id.toString()
      });
      
      if (!guide) {
        return res.status(403).json({
          error: 'Guide profile not found'
        });
      }
      
      // Check if guide is assigned to this slot (root-level)
      // Note: assignedGuideId might be populated, so we need to handle both cases
      const assignedGuideId = slot.assignedGuideId?._id || slot.assignedGuideId;
      
      if (!assignedGuideId || assignedGuideId.toString() !== guide._id.toString()) {
        return res.status(403).json({
          error: 'Access denied. You are not assigned to this tour'
        });
      }
    }
    
    // Get activity bookings for this slot
    // If the slot requires sub-slots and guide is assigned at root level,
    // fetch ALL bookings across all sub-slots
    const bookings = await ActivityBooking.find({ 
      slotId: slot._id,
      status: { $ne: 'CANCELLED' }
    })
      .select('bookingId confirmationCode productTitle startDateTime totalPassengers totalAdults totalYouth totalChildren totalInfants status passengers subSlotId')
      .sort({ bookingId: 1 })
      .lean();
    
    // Calculate aggregated passenger counts from bookings
    const aggregatedCounts = bookings.reduce((acc, booking) => {
      acc.totalPassengers += booking.totalPassengers || 0;
      acc.totalAdults += booking.totalAdults || 0;
      acc.totalYouth += booking.totalYouth || 0;
      acc.totalChildren += booking.totalChildren || 0;
      acc.totalInfants += booking.totalInfants || 0;
      return acc;
    }, {
      totalPassengers: 0,
      totalAdults: 0,
      totalYouth: 0,
      totalChildren: 0,
      totalInfants: 0
    });
    
    // Lookup product to get requiresTickets flag and nickname
    let requiresTickets = false;
    let productNickname = null;
    if (slot.productId) {
      try {
        const product = await Product.findOne({ productId: String(slot.productId) })
          .select('requiresTickets nickname')
          .lean();
        requiresTickets = product?.requiresTickets || false;
        productNickname = product?.nickname || null;
      } catch (err) {
        console.log('[SlotController] Product lookup failed:', err.message);
      }
    }
    
    // Return slot with bookings and aggregated counts
    res.status(200).json({ 
      slot: {
        ...slot,
        bookings,
        requiresTickets, // Add requiresTickets flag from product
        productNickname, // Add product nickname for guide display
        // Override with actual counts from bookings
        totalAdults: aggregatedCounts.totalAdults,
        totalYouth: aggregatedCounts.totalYouth,
        totalChildren: aggregatedCounts.totalChildren,
        totalInfants: aggregatedCounts.totalInfants,
        currentPassengerCount: aggregatedCounts.totalPassengers
      }
    });
  } catch (error) {
    console.error('Get slot by ID error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Assign a guide to a slot
 * PUT /api/slots/:slotId/assign-guide
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const assignGuide = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { guideId } = req.body;
    
    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ 
        error: 'Invalid slot ID format' 
      });
    }
    
    // Validate guideId
    if (!guideId) {
      return res.status(400).json({ 
        error: 'Guide ID is required' 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(guideId)) {
      return res.status(400).json({ 
        error: 'Invalid guide ID format' 
      });
    }
    
    // Find slot
    const slot = await TimeSlot.findById(slotId);
    
    if (!slot) {
      return res.status(404).json({ 
        error: 'Slot not found' 
      });
    }
    
    // Find guide
    const guide = await Guide.findById(guideId);
    
    if (!guide) {
      return res.status(404).json({ 
        error: 'Guide not found' 
      });
    }
    
    // Check if slot is already assigned to this guide
    if (slot.assignedGuideId && slot.assignedGuideId.toString() === guideId) {
      return res.status(400).json({ 
        error: 'Guide is already assigned to this slot' 
      });
    }
    
    // CHECK AVAILABILITY BEFORE ASSIGNING
    // This prevents double-booking and calendar conflicts
    const availabilityCheck = await calendarService.checkGuideAvailability(
      guide.email,
      slot.startDateTime,
      slot.endDateTime,
      slot._id, // Exclude current slot from conflict check
      false,    // Don't skip time range check
      String(slot.productId) // Pass productId for duration lookup and 30min buffer
    );
    
    if (!availabilityCheck.available) {
      console.log(`[SlotController] Guide ${guide.guideName} is not available: ${availabilityCheck.reason}`);
      return res.status(409).json({ 
        error: 'Guide is not available at this time',
        reason: availabilityCheck.reason,
        conflictingEvents: availabilityCheck.conflictingEvents
      });
    }
    
    console.log(`[SlotController] Guide ${guide.guideName} is available, proceeding with assignment`);
    
    // Remove slot from previous guide's assignedSlots if exists
    if (slot.assignedGuideId) {
      await Guide.findByIdAndUpdate(
        slot.assignedGuideId,
        { $pull: { assignedSlots: slot._id } }
      );
    }
    
    // UNIFIED SYSTEM: Update both root-level AND Sub-Slot A
    // For single-slot products, only Sub-Slot A exists
    // For multi-slot products, this assigns at root level (admin can assign individual sub-slots separately)
    
    // Update root-level assignment (for backward compatibility and admin view)
    slot.assignedGuideId = guide._id;
    slot.assignedGuideName = guide.guideName;
    
    // Update status to ASSIGNED (unless it's FULL or CANCELLED)
    if (slot.status !== 'FULL' && slot.status !== 'CANCELLED') {
      slot.status = 'ASSIGNED';
    }
    
    // UNIFIED SYSTEM: Also update Sub-Slot A (or all sub-slots for single-slot products)
    if (slot.subSlots && slot.subSlots.length > 0) {
      // For single-slot products (requiresSubSlots = false), update Sub-Slot A
      if (!slot.requiresSubSlots) {
        slot.subSlots[0].assignedGuideId = guide._id;
        slot.subSlots[0].assignedGuideName = guide.guideName;
        if (slot.subSlots[0].status !== 'FULL' && slot.subSlots[0].status !== 'CANCELLED') {
          slot.subSlots[0].status = 'ASSIGNED';
        }
      }
      // For multi-slot products, root-level assignment is just for admin overview
      // Individual sub-slots can be assigned separately via subSlotController
    }
    
    await slot.save();
    
    // Add slot to guide's assignedSlots array (if not already there)
    if (!guide.assignedSlots.includes(slot._id)) {
      guide.assignedSlots.push(slot._id);
      await guide.save();
    }
    
    // Update all activity bookings for this slot with guideId
    // For single-slot products, all bookings are in Sub-Slot A
    // For multi-slot products, only update bookings in Sub-Slot A (if assigning at root level)
    const bookingFilter = { slotId: slot._id };
    if (!slot.requiresSubSlots) {
      // Single-slot: update all bookings (they're all in Sub-Slot A)
      await ActivityBooking.updateMany(
        bookingFilter,
        { $set: { guideId: guide._id } }
      );
    }
    // For multi-slot products, don't update bookings at root level
    // They should be updated when assigning individual sub-slots
    
    console.log(`[SlotController] Assigned guide ${guide.guideName} (${guideId}) to slot ${slotId} (requiresSubSlots: ${slot.requiresSubSlots})`);
    
    // Send tour assignment email notification
    const tourDate = new Date(slot.startDateTime).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Get product nickname for display
    let tourDisplayName = slot.productTitle || 'Tour';
    try {
      const product = await Product.findOne({ productId: String(slot.productId) })
        .select('nickname name')
        .lean();
      if (product?.nickname) {
        tourDisplayName = product.nickname;
      }
    } catch (err) {
      console.log('[SlotController] Product lookup for nickname failed:', err.message);
    }
    
    const emailResult = await emailService.sendTourAssignmentEmail(
      guide.email,
      guide.guideName,
      {
        tourName: tourDisplayName,
        date: tourDate,
        startTime: new Date(slot.startDateTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        endTime: new Date(slot.endDateTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    );
    
    if (!emailResult.success) {
      console.error('Failed to send tour assignment email:', emailResult.error);
    }
    
    // Return updated slot with populated guide
    const updatedSlot = await TimeSlot.findById(slotId)
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .lean();
    
    res.status(200).json({ 
      slot: updatedSlot,
      message: `Guide ${guide.guideName} assigned successfully`,
      emailSent: emailResult.success
    });
  } catch (error) {
    console.error('Assign guide error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Unassign guide from a slot
 * @route DELETE /api/slots/:slotId/guide
 */
export const unassignGuide = async (req, res) => {
  try {
    const { slotId } = req.params;
    
    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ 
        error: 'Invalid slot ID format' 
      });
    }
    
    // Find slot
    const slot = await TimeSlot.findById(slotId);
    
    if (!slot) {
      return res.status(404).json({ 
        error: 'Slot not found' 
      });
    }
    
    // Check if slot has an assigned guide
    if (!slot.assignedGuideId) {
      return res.status(400).json({ 
        error: 'No guide is assigned to this slot' 
      });
    }
    
    const previousGuideId = slot.assignedGuideId;
    
    // Get guide info for calendar event deletion
    const guide = await Guide.findById(previousGuideId);
    const guideEmail = guide?.calendarEmail || guide?.email;
    
    // Delete calendar event if it exists
    if (slot.calendarEventId && guideEmail) {
      const calendarService = (await import('../services/calendarService.js')).default;
      await calendarService.deleteEvent(slot.calendarEventId, guideEmail);
      console.log(`[SlotController] Deleted calendar event ${slot.calendarEventId} for guide`);
    }
    
    // Remove slot from guide's assignedSlots array
    await Guide.findByIdAndUpdate(
      previousGuideId,
      { $pull: { assignedSlots: slot._id } }
    );
    
    // Clear root-level assignment
    slot.assignedGuideId = null;
    slot.assignedGuideName = null;
    slot.calendarEventId = null;  // Clear calendar event ID
    
    // Update status back to UNASSIGNED (unless it's FULL or CANCELLED)
    if (slot.status === 'ASSIGNED') {
      slot.status = 'UNASSIGNED';
    }
    
    // UNIFIED SYSTEM: Also clear Sub-Slot A (or all sub-slots for single-slot products)
    if (slot.subSlots && slot.subSlots.length > 0) {
      // For single-slot products (requiresSubSlots = false), clear Sub-Slot A
      if (!slot.requiresSubSlots) {
        slot.subSlots[0].assignedGuideId = null;
        slot.subSlots[0].assignedGuideName = null;
        if (slot.subSlots[0].status === 'ASSIGNED') {
          slot.subSlots[0].status = 'UNASSIGNED';
        }
      }
    }
    
    await slot.save();
    
    // Clear guideId from all activity bookings for this slot
    const bookingFilter = { slotId: slot._id };
    if (!slot.requiresSubSlots) {
      // Single-slot: clear all bookings (they're all in Sub-Slot A)
      await ActivityBooking.updateMany(
        bookingFilter,
        { $set: { guideId: null } }
      );
    }
    
    console.log(`[SlotController] Unassigned guide from slot ${slotId}`);
    
    // Return updated slot
    const updatedSlot = await TimeSlot.findById(slotId).lean();
    
    res.status(200).json({ 
      slot: updatedSlot,
      message: 'Guide unassigned successfully'
    });
  } catch (error) {
    console.error('Unassign guide error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Get past tours with pagination
 * GET /api/slots/past-tours
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getPastTours = async (req, res) => {
  try {
    const { page = 1, limit = 20, productId, guideId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query for past tours (endDateTime < now)
    const now = new Date();
    const filters = {
      endDateTime: { $lt: now }
    };
    
    // For coordinators, filter by assigned products
    if (req.user.role === 'COORDINATOR') {
      const coordinator = await Coordinator.findOne({ userId: req.user.id });
      if (coordinator && coordinator.assignedProducts.length > 0) {
        filters.productId = { $in: coordinator.assignedProducts };
      } else {
        // Coordinator with no products assigned sees nothing
        return res.status(200).json({
          tours: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalCount: 0,
            limit: parseInt(limit)
          }
        });
      }
    } else if (productId) {
      filters.productId = parseInt(productId);
    }
    
    if (guideId) {
      filters.assignedGuideId = new mongoose.Types.ObjectId(guideId);
    }
    
    // Get total count for pagination
    const totalCount = await TimeSlot.countDocuments(filters);
    
    // Query past tours with pagination
    const slots = await TimeSlot.find(filters)
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .sort({ startDateTime: -1 }) // Most recent first
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get product nicknames for all slots
    const productIds = [...new Set(slots.map(s => String(s.productId)))];
    const products = await Product.find({ productId: { $in: productIds } })
      .select('productId nickname name')
      .lean();
    
    const productMap = products.reduce((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {});
    
    // Get booking counts for each slot
    const slotIds = slots.map(s => s._id);
    const bookingCounts = await ActivityBooking.aggregate([
      {
        $match: {
          slotId: { $in: slotIds },
          status: { $ne: 'CANCELLED' }
        }
      },
      {
        $group: {
          _id: '$slotId',
          totalBookings: { $sum: 1 },
          totalPassengers: { $sum: '$totalPassengers' }
        }
      }
    ]);
    
    const bookingCountMap = bookingCounts.reduce((acc, bc) => {
      acc[bc._id.toString()] = bc;
      return acc;
    }, {});
    
    // Enrich slots with product info and booking counts
    const enrichedSlots = slots.map(slot => {
      const product = productMap[String(slot.productId)];
      const bookingInfo = bookingCountMap[slot._id.toString()] || { totalBookings: 0, totalPassengers: 0 };
      
      return {
        ...slot,
        productNickname: product?.nickname || null,
        productTitle: product?.name || slot.productTitle,
        totalBookings: bookingInfo.totalBookings,
        totalPassengers: bookingInfo.totalPassengers
      };
    });
    
    res.status(200).json({
      tours: enrichedSlots,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get past tours error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

export default {
  getSlots,
  getSlotById,
  assignGuide,
  unassignGuide,
  getPastTours
};
