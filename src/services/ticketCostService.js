import TimeSlot from '../models/TimeSlot.js';
import ActivityBooking from '../models/ActivityBooking.js';
import Product from '../models/Product.js';
import { getSubSlotById, getSubSlotBookings } from './subSlotService.js';

/**
 * Ticket Cost Calculation Service
 * Handles calculation of ticket costs for sub-slots and root-level slots
 * based on passenger counts and product pricing
 */

/**
 * Calculate ticket cost from passenger counts and pricing
 * @param {Object} passengerCounts - Object with adults, youth, children counts
 * @param {Object} ticketPricing - Object with adult, youth, child prices
 * @returns {Object} Calculation object with breakdown and total
 */
export function calculateTicketCost(passengerCounts, ticketPricing) {
  // Validate inputs
  if (!passengerCounts || !ticketPricing) {
    throw new Error('Missing passenger counts or ticket pricing');
  }

  const calculation = {
    adults: {
      count: passengerCounts.adults || 0,
      price: ticketPricing.adult || 0,
      subtotal: 0
    },
    youth: {
      count: passengerCounts.youth || 0,
      price: ticketPricing.youth || 0,
      subtotal: 0
    },
    children: {
      count: passengerCounts.children || 0,
      price: ticketPricing.child || 0,
      subtotal: 0
    },
    total: 0
  };

  // Calculate subtotals
  calculation.adults.subtotal = calculation.adults.count * calculation.adults.price;
  calculation.youth.subtotal = calculation.youth.count * calculation.youth.price;
  calculation.children.subtotal = calculation.children.count * calculation.children.price;

  // Calculate total
  calculation.total = calculation.adults.subtotal + 
                     calculation.youth.subtotal + 
                     calculation.children.subtotal;

  return calculation;
}

/**
 * Get passenger counts from a list of bookings
 * @param {Array} bookings - Array of ActivityBooking documents
 * @returns {Object} Object with adults, youth, children counts
 */
export function getPassengerCountsFromBookings(bookings) {
  const counts = {
    adults: 0,
    youth: 0,
    children: 0
  };

  for (const booking of bookings) {
    counts.adults += booking.totalAdults || 0;
    counts.youth += booking.totalYouth || 0;
    counts.children += booking.totalChildren || 0;
  }

  return counts;
}

/**
 * Calculate ticket cost for a sub-slot
 * @param {Object} timeSlot - TimeSlot document
 * @param {String} subSlotId - Sub-slot ID
 * @param {Object} product - Product document with pricing
 * @returns {Promise<Object>} Calculation object with breakdown and total
 */
export async function calculateSubSlotTicketCost(timeSlot, subSlotId, product) {
  try {
    // Get the sub-slot
    const subSlot = getSubSlotById(timeSlot, subSlotId);
    
    if (!subSlot) {
      throw new Error(`Sub-slot ${subSlotId} not found in time slot ${timeSlot._id}`);
    }

    // Get all bookings for this sub-slot
    const bookings = await getSubSlotBookings(timeSlot._id, subSlotId);

    // Get passenger counts from bookings
    const passengerCounts = getPassengerCountsFromBookings(bookings);

    // Calculate ticket cost
    const calculation = calculateTicketCost(passengerCounts, product.ticketPricing);

    console.log(`[TicketCostService] Calculated cost for sub-slot ${subSlotId}: €${calculation.total}`);
    console.log(`[TicketCostService] Breakdown: ${calculation.adults.count} adults × €${calculation.adults.price} = €${calculation.adults.subtotal}, ${calculation.youth.count} youth × €${calculation.youth.price} = €${calculation.youth.subtotal}, ${calculation.children.count} children × €${calculation.children.price} = €${calculation.children.subtotal}`);

    return calculation;
  } catch (error) {
    console.error('[TicketCostService] Error calculating sub-slot ticket cost:', error);
    throw error;
  }
}

/**
 * Calculate ticket cost for a root-level slot (non-sub-slot product)
 * @param {Object} timeSlot - TimeSlot document
 * @param {Object} product - Product document with pricing
 * @returns {Promise<Object>} Calculation object with breakdown and total
 */
export async function calculateRootSlotTicketCost(timeSlot, product) {
  try {
    // Get all bookings for this slot
    const bookings = await ActivityBooking.find({
      slotId: timeSlot._id,
      status: { $ne: 'CANCELLED' }
    });

    // Get passenger counts from bookings
    const passengerCounts = getPassengerCountsFromBookings(bookings);

    // Calculate ticket cost
    const calculation = calculateTicketCost(passengerCounts, product.ticketPricing);

    console.log(`[TicketCostService] Calculated cost for root slot ${timeSlot._id}: €${calculation.total}`);

    return calculation;
  } catch (error) {
    console.error('[TicketCostService] Error calculating root slot ticket cost:', error);
    throw error;
  }
}

/**
 * Update ticket cost calculation for a sub-slot and save to database
 * @param {Object} timeSlot - TimeSlot document
 * @param {String} subSlotId - Sub-slot ID
 * @param {Object} product - Product document with pricing
 * @returns {Promise<Object>} Updated sub-slot with new calculation
 */
export async function updateSubSlotTicketCost(timeSlot, subSlotId, product) {
  try {
    // Calculate the ticket cost
    const calculation = await calculateSubSlotTicketCost(timeSlot, subSlotId, product);

    // Get the sub-slot
    const subSlot = getSubSlotById(timeSlot, subSlotId);
    
    if (!subSlot) {
      throw new Error(`Sub-slot ${subSlotId} not found in time slot ${timeSlot._id}`);
    }

    // Update the sub-slot's ticket cost calculation
    subSlot.ticketCostCalculation = calculation;

    // Save the time slot
    await timeSlot.save();

    console.log(`[TicketCostService] Updated ticket cost calculation for sub-slot ${subSlotId}`);

    return subSlot;
  } catch (error) {
    console.error('[TicketCostService] Error updating sub-slot ticket cost:', error);
    throw error;
  }
}

/**
 * Update ticket cost calculation for a root-level slot and save to database
 * @param {Object} timeSlot - TimeSlot document
 * @param {Object} product - Product document with pricing
 * @returns {Promise<Object>} Updated time slot with new calculation
 */
export async function updateRootSlotTicketCost(timeSlot, product) {
  try {
    // Calculate the ticket cost
    const calculation = await calculateRootSlotTicketCost(timeSlot, product);

    // Update the time slot's ticket cost calculation
    timeSlot.ticketCostCalculation = calculation;

    // Save the time slot
    await timeSlot.save();

    console.log(`[TicketCostService] Updated ticket cost calculation for root slot ${timeSlot._id}`);

    return timeSlot;
  } catch (error) {
    console.error('[TicketCostService] Error updating root slot ticket cost:', error);
    throw error;
  }
}

/**
 * Update ticket cost calculation for a slot (handles both sub-slot and root-level)
 * @param {String|ObjectId} slotId - TimeSlot ID
 * @param {String} subSlotId - Sub-slot ID (optional, null for root-level slots)
 * @returns {Promise<Object>} Updated slot or sub-slot with new calculation
 */
export async function updateTicketCostForSlot(slotId, subSlotId = null) {
  try {
    // Find the time slot
    const timeSlot = await TimeSlot.findById(slotId);
    
    if (!timeSlot) {
      throw new Error(`Time slot ${slotId} not found`);
    }

    // Find the product
    const product = await Product.findOne({ productId: String(timeSlot.productId) });
    
    if (!product) {
      throw new Error(`Product ${timeSlot.productId} not found`);
    }

    // Update based on whether this is a sub-slot or root-level slot
    if (subSlotId) {
      return await updateSubSlotTicketCost(timeSlot, subSlotId, product);
    } else {
      return await updateRootSlotTicketCost(timeSlot, product);
    }
  } catch (error) {
    console.error('[TicketCostService] Error updating ticket cost for slot:', error);
    throw error;
  }
}

/**
 * Format ticket cost calculation for display
 * @param {Object} calculation - Calculation object
 * @returns {Object} Formatted calculation with display strings
 */
export function formatTicketCostForDisplay(calculation) {
  if (!calculation) {
    return null;
  }

  return {
    breakdown: [
      {
        category: 'Adults',
        count: calculation.adults.count,
        price: calculation.adults.price,
        subtotal: calculation.adults.subtotal,
        display: `${calculation.adults.count} × €${calculation.adults.price.toFixed(2)} = €${calculation.adults.subtotal.toFixed(2)}`
      },
      {
        category: 'Youth',
        count: calculation.youth.count,
        price: calculation.youth.price,
        subtotal: calculation.youth.subtotal,
        display: `${calculation.youth.count} × €${calculation.youth.price.toFixed(2)} = €${calculation.youth.subtotal.toFixed(2)}`
      },
      {
        category: 'Children',
        count: calculation.children.count,
        price: calculation.children.price,
        subtotal: calculation.children.subtotal,
        display: `${calculation.children.count} × €${calculation.children.price.toFixed(2)} = €${calculation.children.subtotal.toFixed(2)}`
      }
    ],
    total: calculation.total,
    totalDisplay: `€${calculation.total.toFixed(2)}`
  };
}

export default {
  calculateTicketCost,
  getPassengerCountsFromBookings,
  calculateSubSlotTicketCost,
  calculateRootSlotTicketCost,
  updateSubSlotTicketCost,
  updateRootSlotTicketCost,
  updateTicketCostForSlot,
  formatTicketCostForDisplay
};
