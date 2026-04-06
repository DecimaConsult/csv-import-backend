import TimeSlot from '../models/TimeSlot.js';
import ActivityBooking from '../models/ActivityBooking.js';

/**
 * Slot Service
 * Handles automatic slot creation, capacity management, and split slot logic
 */

/**
 * Assign an activity booking to a slot
 * Auto-creates slots or split slots based on capacity
 * @param {Object} activityBooking - ActivityBooking document
 * @returns {Promise<Object>} Assigned slot
 */
export async function assignToSlot(activityBooking) {
  try {
    const { productId, productTitle, startDateTime, endDateTime, totalPassengers, status } = activityBooking;
    
    // Only assign confirmed or pending bookings
    if (status === 'CANCELLED') {
      console.log(`[SlotService] Skipping cancelled booking ${activityBooking.bookingId}`);
      return null;
    }
    
    // Validate required fields
    if (!productId || !startDateTime || totalPassengers === undefined) {
      throw new Error('Missing required fields for slot assignment');
    }
    
    console.log(`[SlotService] Assigning booking ${activityBooking.bookingId} with ${totalPassengers} passengers to slot`);
    
    // Search for existing slot with same productId and startDateTime
    const existingSlots = await TimeSlot.find({ 
      productId, 
      startDateTime: new Date(startDateTime),
      status: { $ne: 'CANCELLED' }
    }).sort({ createdAt: 1 }); // Sort by creation time to prefer original slots
    
    let assignedSlot = null;
    
    if (existingSlots.length === 0) {
      // No existing slot - create new one
      console.log(`[SlotService] No existing slot found, creating new slot`);
      assignedSlot = await createSlot(activityBooking);
    } else {
      // Check if any existing slot has capacity
      let slotWithCapacity = null;
      
      for (const slot of existingSlots) {
        if (slot.currentPassengerCount + totalPassengers <= slot.maxCapacity) {
          slotWithCapacity = slot;
          break;
        }
      }
      
      if (slotWithCapacity) {
        // Add to existing slot with capacity
        console.log(`[SlotService] Adding to existing slot ${slotWithCapacity._id}`);
        assignedSlot = await addToSlot(slotWithCapacity, activityBooking);
      } else {
        // All slots are full - create split slot
        console.log(`[SlotService] All slots full, creating split slot`);
        const parentSlot = existingSlots[0]; // Use first (original) slot as parent
        assignedSlot = await createSplitSlot(parentSlot, activityBooking);
      }
    }
    
    // Update activity booking with slotId
    activityBooking.slotId = assignedSlot._id;
    await activityBooking.save();
    
    console.log(`[SlotService] Booking ${activityBooking.bookingId} assigned to slot ${assignedSlot._id}`);
    
    return assignedSlot;
  } catch (error) {
    console.error('[SlotService] Error assigning to slot:', error);
    throw error;
  }
}

/**
 * Create a new slot for an activity booking
 * @param {Object} activityBooking - ActivityBooking document
 * @returns {Promise<Object>} Created slot
 */
export async function createSlot(activityBooking) {
  try {
    const { productId, productTitle, startDateTime, endDateTime, totalPassengers } = activityBooking;
    
    const slotData = {
      productId,
      productTitle,
      startDateTime: new Date(startDateTime),
      endDateTime: endDateTime ? new Date(endDateTime) : null,
      maxCapacity: 25,
      currentPassengerCount: totalPassengers,
      bookingCount: 1,
      status: 'UNASSIGNED',
      isSplitSlot: false,
      createdReason: 'initial',
    };
    
    const slot = await TimeSlot.create(slotData);
    
    console.log(`[SlotService] Created new slot ${slot._id} with ${totalPassengers} passengers`);
    
    return slot;
  } catch (error) {
    console.error('[SlotService] Error creating slot:', error);
    throw error;
  }
}

/**
 * Add an activity booking to an existing slot
 * @param {Object} slot - TimeSlot document
 * @param {Object} activityBooking - ActivityBooking document
 * @returns {Promise<Object>} Updated slot
 */
export async function addToSlot(slot, activityBooking) {
  try {
    const { totalPassengers } = activityBooking;
    
    // Verify capacity
    if (slot.currentPassengerCount + totalPassengers > slot.maxCapacity) {
      throw new Error(`Cannot add ${totalPassengers} passengers to slot ${slot._id} - would exceed capacity`);
    }
    
    // Update slot capacity
    slot.currentPassengerCount += totalPassengers;
    slot.bookingCount += 1;
    
    // Update status if full
    if (slot.currentPassengerCount >= slot.maxCapacity) {
      slot.status = 'FULL';
    }
    
    await slot.save();
    
    console.log(`[SlotService] Added ${totalPassengers} passengers to slot ${slot._id} (now ${slot.currentPassengerCount}/${slot.maxCapacity})`);
    
    return slot;
  } catch (error) {
    console.error('[SlotService] Error adding to slot:', error);
    throw error;
  }
}

/**
 * Create a split slot when capacity is exceeded
 * @param {Object} parentSlot - Original TimeSlot document
 * @param {Object} activityBooking - ActivityBooking document
 * @returns {Promise<Object>} Created split slot
 */
export async function createSplitSlot(parentSlot, activityBooking) {
  try {
    const { totalPassengers } = activityBooking;
    
    const splitSlotData = {
      productId: parentSlot.productId,
      productTitle: parentSlot.productTitle,
      startDateTime: parentSlot.startDateTime,
      endDateTime: parentSlot.endDateTime,
      maxCapacity: 25,
      currentPassengerCount: totalPassengers,
      bookingCount: 1,
      status: 'UNASSIGNED',
      isSplitSlot: true,
      parentSlotId: parentSlot._id,
      createdReason: 'capacity_exceeded',
    };
    
    const splitSlot = await TimeSlot.create(splitSlotData);
    
    console.log(`[SlotService] Created split slot ${splitSlot._id} from parent ${parentSlot._id} with ${totalPassengers} passengers`);
    
    return splitSlot;
  } catch (error) {
    console.error('[SlotService] Error creating split slot:', error);
    throw error;
  }
}

/**
 * Update slot capacity by recalculating from all activity bookings
 * @param {String} slotId - Slot ID to update
 * @returns {Promise<Object>} Updated slot
 */
export async function updateSlotCapacity(slotId) {
  try {
    const slot = await TimeSlot.findById(slotId);
    
    if (!slot) {
      throw new Error(`Slot ${slotId} not found`);
    }
    
    // Find all non-cancelled activity bookings for this slot
    const activityBookings = await ActivityBooking.find({
      slotId: slot._id,
      status: { $ne: 'CANCELLED' }
    });
    
    // Recalculate passenger count
    const totalPassengers = activityBookings.reduce((sum, booking) => {
      return sum + (booking.totalPassengers || 0);
    }, 0);
    
    const bookingCount = activityBookings.length;
    
    // Update slot
    slot.currentPassengerCount = totalPassengers;
    slot.bookingCount = bookingCount;
    
    // Update status based on capacity
    if (totalPassengers === 0) {
      slot.status = 'EMPTY';
    } else if (totalPassengers >= slot.maxCapacity) {
      slot.status = 'FULL';
    } else if (slot.assignedGuideId) {
      slot.status = 'ASSIGNED';
    } else {
      slot.status = 'UNASSIGNED';
    }
    
    await slot.save();
    
    console.log(`[SlotService] Updated slot ${slotId} capacity: ${totalPassengers}/${slot.maxCapacity} passengers, ${bookingCount} bookings, status: ${slot.status}`);
    
    return slot;
  } catch (error) {
    console.error('[SlotService] Error updating slot capacity:', error);
    throw error;
  }
}

/**
 * Handle booking cancellation and recalculate slot capacity
 * @param {Object} activityBooking - Cancelled ActivityBooking document
 * @returns {Promise<Object>} Updated slot or null if no slot assigned
 */
export async function handleCancellation(activityBooking) {
  try {
    const { slotId, bookingId, totalPassengers } = activityBooking;
    
    if (!slotId) {
      console.log(`[SlotService] No slot assigned to cancelled booking ${bookingId}`);
      return null;
    }
    
    console.log(`[SlotService] Handling cancellation for booking ${bookingId} (${totalPassengers} passengers) in slot ${slotId}`);
    
    // Recalculate slot capacity
    const updatedSlot = await updateSlotCapacity(slotId);
    
    // If slot is now empty, optionally remove guide assignment
    if (updatedSlot.status === 'EMPTY' && updatedSlot.assignedGuideId) {
      console.log(`[SlotService] Slot ${slotId} is now empty, but keeping guide assignment for record`);
      // Note: We keep the guide assignment for audit trail
      // Admin can manually unassign if needed
    }
    
    return updatedSlot;
  } catch (error) {
    console.error('[SlotService] Error handling cancellation:', error);
    throw error;
  }
}

export default {
  assignToSlot,
  createSlot,
  addToSlot,
  createSplitSlot,
  updateSlotCapacity,
  handleCancellation,
};
