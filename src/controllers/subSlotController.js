import TimeSlot from '../models/TimeSlot.js';
import ActivityBooking from '../models/ActivityBooking.js';
import Guide from '../models/Guide.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';
import { filterSubSlotData, filterBookingData } from '../middleware/roleBasedFilter.js';
import emailService from '../services/emailService.js';
import calendarService from '../services/calendarService.js';

/**
 * Sub-Slot Controller
 * Handles HTTP requests for sub-slot management
 */

/**
 * Get all sub-slots for a time slot
 * GET /api/slots/:slotId/sub-slots
 */
export const getSubSlots = async (req, res) => {
  try {
    const { slotId } = req.params;
    const userRole = req.user.role;
    
    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid slot ID format' 
      });
    }
    
    // Find the time slot
    const slot = await TimeSlot.findById(slotId).lean();
    
    if (!slot) {
      return res.status(404).json({ 
        success: false,
        error: 'Time slot not found' 
      });
    }
    
    // Check if slot uses sub-slots
    if (!slot.requiresSubSlots || !slot.subSlots || slot.subSlots.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'This time slot does not use sub-slots',
        data: {
          slotId: slot._id,
          requiresSubSlots: slot.requiresSubSlots,
          subSlots: []
        }
      });
    }
    
    // Get product for pricing info
    const product = await Product.findOne({ productId: slot.productId }).lean();
    
    // Filter sub-slots based on user role
    const filteredSubSlots = slot.subSlots.map(subSlot => 
      filterSubSlotData(subSlot, userRole, product)
    );
    
    res.status(200).json({
      success: true,
      data: {
        slotId: slot._id,
        productId: slot.productId,
        productTitle: slot.productTitle,
        startDateTime: slot.startDateTime,
        endDateTime: slot.endDateTime,
        subSlots: filteredSubSlots,
        count: filteredSubSlots.length
      }
    });
  } catch (error) {
    console.error('Get sub-slots error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Get specific sub-slot details with bookings
 * GET /api/slots/:slotId/sub-slots/:subSlotId
 */
export const getSubSlotById = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;
    
    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid slot ID format' 
      });
    }
    
    // Find the time slot with populated guide info
    const slot = await TimeSlot.findById(slotId)
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .lean();
    
    if (!slot) {
      return res.status(404).json({ 
        success: false,
        error: 'Time slot not found' 
      });
    }
    
    // Check if slot uses sub-slots
    if (!slot.requiresSubSlots || !slot.subSlots) {
      return res.status(400).json({
        success: false,
        error: 'This time slot does not use sub-slots'
      });
    }
    
    // Find the specific sub-slot
    const subSlot = slot.subSlots.find(ss => ss.subSlotId === subSlotId);
    
    if (!subSlot) {
      return res.status(404).json({
        success: false,
        error: 'Sub-slot not found'
      });
    }
    
    // For guides, check if they are assigned to this sub-slot OR to the root slot
    if (userRole === 'GUIDE') {
      // Find the guide document for this user
      const guide = await Guide.findOne({ userId: userId });
      
      if (!guide) {
        return res.status(403).json({
          success: false,
          error: 'Guide profile not found'
        });
      }
      
      // Check if guide is assigned to the specific sub-slot
      const isAssignedToSubSlot = subSlot.assignedGuideId && 
        subSlot.assignedGuideId.toString() === guide._id.toString();
      
      // Check if guide is assigned at root level (can access all sub-slots)
      const isAssignedToRootSlot = slot.assignedGuideId && 
        slot.assignedGuideId.toString() === guide._id.toString();
      
      if (!isAssignedToSubSlot && !isAssignedToRootSlot) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You are not assigned to this sub-slot or tour'
        });
      }
    }
    
    // Get product for pricing info
    const product = await Product.findOne({ productId: slot.productId }).lean();
    
    // Get bookings for this sub-slot (get all fields to include checkInStatus)
    const bookings = await ActivityBooking.find({
      slotId: slot._id,
      subSlotId: subSlotId,
      status: { $ne: 'CANCELLED' }
    })
      .sort({ bookingId: 1 })
      .lean();
    
    // Filter booking data based on role
    const filteredBookings = bookings.map(booking => 
      filterBookingData(booking, userRole)
    );
    
    // Filter sub-slot data based on role
    const filteredSubSlot = filterSubSlotData(subSlot, userRole, product);
    
    res.status(200).json({
      success: true,
      data: {
        slotId: slot._id,
        productId: slot.productId,
        productTitle: slot.productTitle,
        startDateTime: slot.startDateTime,
        endDateTime: slot.endDateTime,
        subSlot: {
          ...filteredSubSlot,
          bookings: filteredBookings
        }
      }
    });
  } catch (error) {
    console.error('Get sub-slot by ID error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Assign a guide to a specific sub-slot
 * PUT /api/slots/:slotId/sub-slots/:subSlotId/assign-guide
 */
export const assignGuideToSubSlot = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;
    const { guideId } = req.body;
    
    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid slot ID format' 
      });
    }
    
    // Validate guideId
    if (!guideId) {
      return res.status(400).json({ 
        success: false,
        error: 'Guide ID is required' 
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(guideId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid guide ID format' 
      });
    }
    
    // Find the time slot
    const slot = await TimeSlot.findById(slotId);
    
    if (!slot) {
      return res.status(404).json({ 
        success: false,
        error: 'Time slot not found' 
      });
    }
    
    // Check if slot uses sub-slots
    if (!slot.requiresSubSlots || !slot.subSlots) {
      return res.status(400).json({
        success: false,
        error: 'This time slot does not use sub-slots'
      });
    }
    
    // Find the specific sub-slot
    const subSlotIndex = slot.subSlots.findIndex(ss => ss.subSlotId === subSlotId);
    
    if (subSlotIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Sub-slot not found'
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
    
    const subSlot = slot.subSlots[subSlotIndex];
    
    // Check if sub-slot is already assigned to this guide
    if (subSlot.assignedGuideId && subSlot.assignedGuideId.toString() === guideId) {
      return res.status(400).json({ 
        success: false,
        error: 'Guide is already assigned to this sub-slot' 
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
      console.log(`[SubSlotController] Guide ${guide.guideName} is not available: ${availabilityCheck.reason}`);
      return res.status(409).json({ 
        success: false,
        error: 'Guide is not available at this time',
        reason: availabilityCheck.reason,
        conflictingEvents: availabilityCheck.conflictingEvents
      });
    }
    
    console.log(`[SubSlotController] Guide ${guide.guideName} is available, proceeding with assignment`);
    
    // Remove sub-slot from previous guide's assignedSlots if exists
    if (subSlot.assignedGuideId) {
      await Guide.findByIdAndUpdate(
        subSlot.assignedGuideId,
        { $pull: { assignedSlots: slot._id } }
      );
    }
    
    // Update sub-slot with guide assignment
    slot.subSlots[subSlotIndex].assignedGuideId = guide._id;
    slot.subSlots[subSlotIndex].assignedGuideName = guide.guideName;
    
    // Update sub-slot status to ASSIGNED (unless it's FULL or COMPLETED)
    if (subSlot.status !== 'FULL' && subSlot.status !== 'COMPLETED') {
      slot.subSlots[subSlotIndex].status = 'ASSIGNED';
    }
    
    await slot.save();
    
    // Add slot to guide's assignedSlots array (if not already there)
    if (!guide.assignedSlots.includes(slot._id)) {
      guide.assignedSlots.push(slot._id);
      await guide.save();
    }
    
    // Update activity bookings for this sub-slot with guideId
    await ActivityBooking.updateMany(
      { slotId: slot._id, subSlotId: subSlotId },
      { $set: { guideId: guide._id } }
    );
    
    console.log(`[SubSlotController] Assigned guide ${guide.guideName} (${guideId}) to sub-slot ${subSlotId} in slot ${slotId}`);
    
    // Get updated slot with product info
    const updatedSlot = await TimeSlot.findById(slotId).lean();
    const product = await Product.findOne({ productId: updatedSlot.productId }).lean();
    const updatedSubSlot = updatedSlot.subSlots.find(ss => ss.subSlotId === subSlotId);
    
    // Send tour assignment email to guide
    const tourDate = new Date(slot.startDateTime).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Get product nickname for display
    let tourDisplayName = slot.productTitle || 'Tour';
    try {
      if (product?.nickname) {
        tourDisplayName = product.nickname;
      }
    } catch (err) {
      console.log('[SubSlotController] Product lookup for nickname failed:', err.message);
    }
    
    const emailResult = await emailService.sendTourAssignmentEmail(
      guide.email,
      guide.guideName,
      {
        tourName: `${tourDisplayName} (Sub-Slot ${subSlotId})`,
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
      console.error('[SubSlotController] Failed to send tour assignment email:', emailResult.error);
    } else {
      console.log(`[SubSlotController] Tour assignment email sent to ${guide.email}`);
    }
    
    // Filter data based on user role
    const filteredSubSlot = filterSubSlotData(updatedSubSlot, req.user.role, product);
    
    res.status(200).json({ 
      success: true,
      message: `Guide ${guide.guideName} assigned successfully to sub-slot ${subSlotId}`,
      data: {
        slotId: updatedSlot._id,
        subSlot: filteredSubSlot
      }
    });
  } catch (error) {
    console.error('Assign guide to sub-slot error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
};
/**
 * Unassign guide from a sub-slot
 * @route DELETE /api/slots/:slotId/subslots/:subSlotId/guide
 */
export const unassignGuideFromSubSlot = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;

    // Validate slotId
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid slot ID format'
      });
    }

    // Find the time slot
    const slot = await TimeSlot.findById(slotId);

    if (!slot) {
      return res.status(404).json({
        success: false,
        error: 'Time slot not found'
      });
    }

    // Check if slot uses sub-slots
    if (!slot.requiresSubSlots || !slot.subSlots) {
      return res.status(400).json({
        success: false,
        error: 'This time slot does not use sub-slots'
      });
    }

    // Find the specific sub-slot
    const subSlotIndex = slot.subSlots.findIndex(ss => ss.subSlotId === subSlotId);

    if (subSlotIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Sub-slot not found'
      });
    }

    const subSlot = slot.subSlots[subSlotIndex];

    // Check if sub-slot has an assigned guide
    if (!subSlot.assignedGuideId) {
      return res.status(400).json({
        success: false,
        error: 'No guide is assigned to this sub-slot'
      });
    }

    const previousGuideId = subSlot.assignedGuideId;
    
    // Get guide info for calendar event deletion
    const guide = await Guide.findById(previousGuideId);
    const guideEmail = guide?.calendarEmail || guide?.email;
    
    // Delete calendar event if it exists
    if (subSlot.calendarEventId && guideEmail) {
      const calendarService = (await import('../services/calendarService.js')).default;
      await calendarService.deleteEvent(subSlot.calendarEventId, guideEmail);
      console.log(`[SubSlotController] Deleted calendar event ${subSlot.calendarEventId} for guide`);
    }

    // Remove slot from guide's assignedSlots array
    await Guide.findByIdAndUpdate(
      previousGuideId,
      { $pull: { assignedSlots: slot._id } }
    );

    // Clear sub-slot assignment
    slot.subSlots[subSlotIndex].assignedGuideId = null;
    slot.subSlots[subSlotIndex].assignedGuideName = null;
    slot.subSlots[subSlotIndex].calendarEventId = null;  // Clear calendar event ID

    // Update sub-slot status back to UNASSIGNED (unless it's FULL or COMPLETED)
    if (subSlot.status === 'ASSIGNED') {
      slot.subSlots[subSlotIndex].status = 'UNASSIGNED';
    }

    await slot.save();

    // Clear guideId from activity bookings for this sub-slot
    await ActivityBooking.updateMany(
      { slotId: slot._id, subSlotId: subSlotId },
      { $set: { guideId: null } }
    );

    console.log(`[SubSlotController] Unassigned guide from sub-slot ${subSlotId} in slot ${slotId}`);

    // Get updated slot
    const updatedSlot = await TimeSlot.findById(slotId).lean();
    const updatedSubSlot = updatedSlot.subSlots.find(ss => ss.subSlotId === subSlotId);

    res.status(200).json({
      success: true,
      slot: updatedSlot,
      subSlot: updatedSubSlot,
      message: 'Guide unassigned successfully from sub-slot'
    });
  } catch (error) {
    console.error('Unassign guide from sub-slot error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

export default {
  getSubSlots,
  getSubSlotById,
  assignGuideToSubSlot,
  unassignGuideFromSubSlot
};
