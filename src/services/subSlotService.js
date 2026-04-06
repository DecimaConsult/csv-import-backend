import mongoose from "mongoose";
import TimeSlot from "../models/TimeSlot.js";
import ActivityBooking from "../models/ActivityBooking.js";
import Product from "../models/Product.js";
import { logger, ErrorCategory } from "../utils/errorLogger.js";
import {
  SubSlotError,
  ValidationError,
  DatabaseError,
} from "../utils/customErrors.js";

/**
 * Sub-Slot Service
 * Handles automatic sub-slot creation, capacity management, and booking assignment
 * for products that require sub-slot functionality
 */

/**
 * Generate sub-slot ID in A, B, C format
 * @param {Number} subSlotNumber - Sub-slot number (1, 2, 3, etc.)
 * @returns {String} Sub-slot ID (A, B, C, etc.)
 */
function generateSubSlotId(subSlotNumber) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  if (subSlotNumber <= 26) {
    return letters[subSlotNumber - 1];
  }

  // For numbers > 26, use format like "AA", "AB", etc.
  const firstLetter = letters[Math.floor((subSlotNumber - 1) / 26) - 1];
  const secondLetter = letters[(subSlotNumber - 1) % 26];
  return firstLetter + secondLetter;
}

/**
 * Create a new sub-slot object
 * @param {Number} subSlotNumber - Sub-slot number (1, 2, 3, etc.)
 * @param {Number} capacity - Maximum capacity for the sub-slot
 * @returns {Object} New sub-slot object
 */
function createNewSubSlot(subSlotNumber, capacity = 25) {
  return {
    subSlotId: generateSubSlotId(subSlotNumber),
    subSlotNumber,
    maxCapacity: capacity,
    currentPassengerCount: 0,
    assignedGuideId: null,
    assignedGuideName: null,
    status: "UNASSIGNED",
    bookingIds: [],
    ticketCostCalculation: {
      adults: { count: 0, price: 0, subtotal: 0 },
      youth: { count: 0, price: 0, subtotal: 0 },
      children: { count: 0, price: 0, subtotal: 0 },
      total: 0,
    },
    receiptId: null,
    createdAt: new Date(),
  };
}

/**
 * Initialize the first sub-slot for a time slot
 * @param {Object} timeSlot - TimeSlot document
 * @param {Number} capacity - Maximum capacity for the sub-slot
 * @returns {Object} Created sub-slot
 */
function initializeFirstSubSlot(timeSlot, capacity = 25) {
  if (!timeSlot.subSlots) {
    timeSlot.subSlots = [];
  }

  if (timeSlot.subSlots.length === 0) {
    const firstSubSlot = createNewSubSlot(1, capacity);
    timeSlot.subSlots.push(firstSubSlot);
    console.log(
      `[SubSlotService] Initialized first sub-slot ${firstSubSlot.subSlotId} for slot ${timeSlot._id}`,
    );
    return firstSubSlot;
  }

  return timeSlot.subSlots[0];
}

/**
 * Find a sub-slot with available capacity for the booking
 * @param {Object} timeSlot - TimeSlot document
 * @param {Number} passengerCount - Number of passengers to accommodate
 * @returns {Object|null} Sub-slot with available capacity or null
 */
function findSubSlotWithCapacity(timeSlot, passengerCount) {
  if (!timeSlot.subSlots || timeSlot.subSlots.length === 0) {
    return null;
  }

  for (const subSlot of timeSlot.subSlots) {
    const availableCapacity =
      subSlot.maxCapacity - subSlot.currentPassengerCount;

    if (availableCapacity >= passengerCount) {
      console.log(
        `[SubSlotService] Found sub-slot ${subSlot.subSlotId} with ${availableCapacity} available capacity`,
      );
      return subSlot;
    }
  }

  console.log(
    `[SubSlotService] No sub-slot found with capacity for ${passengerCount} passengers`,
  );
  return null;
}

/**
 * Create a new sub-slot when existing ones are full
 * @param {Object} timeSlot - TimeSlot document
 * @param {Number} capacity - Maximum capacity for the new sub-slot
 * @returns {Object} Created sub-slot
 */
function createAdditionalSubSlot(timeSlot, capacity = 25) {
  const newSubSlotNumber = timeSlot.subSlots.length + 1;
  const newSubSlot = createNewSubSlot(newSubSlotNumber, capacity);

  timeSlot.subSlots.push(newSubSlot);

  console.log(
    `[SubSlotService] Created new sub-slot ${newSubSlot.subSlotId} (number ${newSubSlotNumber}) for slot ${timeSlot._id}`,
  );

  return newSubSlot;
}

/**
 * Assign a booking to a sub-slot
 * @param {Object} subSlot - Sub-slot object
 * @param {Object} booking - ActivityBooking document
 * @returns {Object} Updated sub-slot
 */
function assignBookingToSubSlot(subSlot, booking) {
  const exists = subSlot.bookingIds.some(
    (id) => id.toString() === booking._id.toString(),
  );

  if (exists) {
    console.log("⛔ Duplicate blocked:", booking.bookingId);
    return subSlot;
  }

  // ✅ ONLY ONE PUSH
  subSlot.bookingIds.push(booking._id);

  // ✅ Update passenger count ONCE
  subSlot.currentPassengerCount += booking.totalPassengers;

  // ✅ Update status
  if (subSlot.currentPassengerCount >= subSlot.maxCapacity) {
    subSlot.status = "FULL";
  } else if (subSlot.assignedGuideId) {
    subSlot.status = "ASSIGNED";
  }

  console.log(
    `[SubSlotService] Assigned booking ${booking.bookingId} to ${subSlot.subSlotId}`,
  );

  return subSlot;
}

/**
 * Process a booking and assign it to the appropriate sub-slot
 * Uses transactions to ensure data consistency with retry logic for transient errors
 *
 * UNIFIED SYSTEM: This now handles ALL bookings, not just multi-slot products.
 * - Single-slot products: Always use Sub-Slot A
 * - Multi-slot products: Create Sub-Slots B, C, D... as needed
 *
 * @param {Object} booking - ActivityBooking document
 * @param {Object} product - Product document
 * @param {Number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<Object>} Result object with timeSlot and subSlot
 */
export async function processBookingWithSubSlots(
  booking,
  product,
  maxRetries = 3,
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Only use transactions if running on a replica set
    let session = null;
    let useTransaction = false;

    try {
      // Check if transactions are supported (replica set or mongos)
      const adminDb = mongoose.connection.db.admin();
      const serverStatus = await adminDb.serverStatus();
      useTransaction =
        serverStatus.repl &&
        (serverStatus.repl.ismaster || serverStatus.repl.secondary);
    } catch (err) {
      // If we can't check, assume standalone (no transactions)
      useTransaction = false;
    }

    if (useTransaction) {
      session = await mongoose.startSession();
      session.startTransaction();
    }

    try {
      const {
        productId,
        startDateTime,
        endDateTime,
        totalPassengers,
        productTitle,
      } = booking;

      // Validate inputs
      if (!productId || !startDateTime || totalPassengers === undefined) {
        throw new ValidationError(
          "Missing required fields for sub-slot assignment",
        );
      }

      if (!product) {
        throw new ValidationError("Product is required for booking assignment");
      }

      const requiresSubSlots = product.requiresSubSlots || false;

      logger.info(
        ErrorCategory.SUB_SLOT,
        `Processing booking ${booking.bookingId} with ${totalPassengers} passengers (attempt ${attempt}/${maxRetries}, requiresSubSlots: ${requiresSubSlots})`,
        {
          bookingId: booking.bookingId,
          productId,
          attempt,
          maxRetries,
          requiresSubSlots,
        },
      );

      // Find or create TimeSlot for this product/time
      let timeSlot = await TimeSlot.findOne({
        productId,
        startDateTime: new Date(startDateTime),
      }).session(session || undefined);

      if (!timeSlot) {
        // Create new TimeSlot with sub-slot configuration
        logger.info(
          ErrorCategory.SUB_SLOT,
          `Creating new TimeSlot for product ${productId} at ${startDateTime}`,
          { productId, startDateTime, requiresSubSlots },
        );

        timeSlot = new TimeSlot({
          productId,
          productTitle: productTitle || product.name,
          startDateTime: new Date(startDateTime),
          endDateTime: endDateTime ? new Date(endDateTime) : null,
          requiresSubSlots: requiresSubSlots,
          subSlots: [],
          maxCapacity: product.subSlotCapacity || 25,
          currentPassengerCount: 0,
          status: "UNASSIGNED",
          createdReason: "initial",
        });
      }

      // Ensure sub-slots array exists
      if (!timeSlot.subSlots) {
        timeSlot.subSlots = [];
      }

      // ALWAYS initialize Sub-Slot A if needed (unified system)
      if (timeSlot.subSlots.length === 0) {
        initializeFirstSubSlot(timeSlot, product.subSlotCapacity || 25);
      }

      let targetSubSlot;

      // For single-slot products: ALWAYS use Sub-Slot A
      if (!requiresSubSlots) {
        targetSubSlot = timeSlot.subSlots[0];
        logger.info(
          ErrorCategory.SUB_SLOT,
          "Single-slot product: assigning to Sub-Slot A",
          { slotId: timeSlot._id, subSlotId: targetSubSlot.subSlotId },
        );
      } else {
        // For multi-slot products: Find sub-slot with available capacity
        targetSubSlot = findSubSlotWithCapacity(timeSlot, totalPassengers);

        // Create new sub-slot if booking doesn't fit in any existing sub-slot
        if (!targetSubSlot) {
          logger.info(
            ErrorCategory.SUB_SLOT,
            "No sub-slot with sufficient capacity, creating new sub-slot",
            { slotId: timeSlot._id, requiredCapacity: totalPassengers },
          );
          targetSubSlot = createAdditionalSubSlot(
            timeSlot,
            product.subSlotCapacity || 25,
          );
        }
      }

      // Handle edge case: booking exceeds sub-slot capacity
      // Instead of rejecting, create a dedicated sub-slot for large bookings
      if (totalPassengers > targetSubSlot.maxCapacity) {
        logger.info(
          ErrorCategory.SUB_SLOT,
          `Booking with ${totalPassengers} passengers exceeds standard sub-slot capacity of ${targetSubSlot.maxCapacity}. Creating dedicated sub-slot.`,
          {
            bookingId: booking.bookingId,
            totalPassengers,
            standardCapacity: targetSubSlot.maxCapacity,
          },
        );

        // Create a new sub-slot with capacity matching the booking size
        // This ensures large bookings are accommodated in their own sub-slot
        const dedicatedCapacity = Math.max(
          totalPassengers,
          product.subSlotCapacity || 25,
        );
        targetSubSlot = createAdditionalSubSlot(timeSlot, dedicatedCapacity);
      }

      // Assign booking to the target sub-slot
      assignBookingToSubSlot(targetSubSlot, booking);

      // Update root-level capacity (sum of all sub-slots)
      timeSlot.currentPassengerCount = timeSlot.subSlots.reduce(
        (sum, ss) => sum + ss.currentPassengerCount,
        0,
      );
      timeSlot.bookingCount = timeSlot.subSlots.reduce(
        (sum, ss) => sum + ss.bookingIds.length,
        0,
      );

      // Update booking with sub-slot assignment
      booking.subSlotId = targetSubSlot.subSlotId;
      booking.slotId = timeSlot._id;

      // Save both documents within the transaction (if using one)
      await timeSlot.save({ session: session || undefined });
      await booking.save({ session: session || undefined });

      // Commit the transaction if we're using one
      if (useTransaction && session) {
        await session.commitTransaction();
      }

      logger.info(
        ErrorCategory.SUB_SLOT,
        `Successfully processed booking ${booking.bookingId} into sub-slot ${targetSubSlot.subSlotId}`,
        { bookingId: booking.bookingId, subSlotId: targetSubSlot.subSlotId },
      );

      return {
        timeSlot,
        subSlot: targetSubSlot,
        success: true,
      };
    } catch (error) {
      // Abort transaction on error if we're using one
      if (useTransaction && session) {
        await session.abortTransaction();
      }

      // Check if this is a transient error that can be retried
      const isTransientError =
        error.errorLabels &&
        error.errorLabels.includes("TransientTransactionError");
      const isWriteConflict =
        error.code === 112 || error.codeName === "WriteConflict";
      const isVersionConflict =
        error.name === "VersionError" ||
        error.message?.includes("No matching document found") ||
        error.message?.includes("version");

      if (
        (isTransientError || isWriteConflict || isVersionConflict) &&
        attempt < maxRetries
      ) {
        logger.warn(
          ErrorCategory.SUB_SLOT,
          `Transient error encountered, retrying... (attempt ${attempt}/${maxRetries})`,
          { error, attempt, maxRetries, bookingId: booking.bookingId },
        );
        lastError = error;

        // Wait a bit before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));

        // Continue to next retry attempt
        continue;
      }

      // Non-transient error or max retries reached
      logger.error(
        ErrorCategory.SUB_SLOT,
        "Error processing booking with sub-slots",
        { error, bookingId: booking.bookingId, attempt },
      );

      // Wrap in appropriate error type
      if (error instanceof ValidationError || error instanceof SubSlotError) {
        throw error;
      }

      throw new DatabaseError(
        "Failed to process booking with sub-slots",
        error,
      );
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  // If we get here, all retries failed
  logger.error(
    ErrorCategory.SUB_SLOT,
    "Failed to process booking after maximum retries",
    { error: lastError, bookingId: booking.bookingId, maxRetries },
  );

  throw new SubSlotError("Failed to process booking after maximum retries");
}

/**
 * Get sub-slot by ID from a time slot
 * @param {Object} timeSlot - TimeSlot document
 * @param {String} subSlotId - Sub-slot ID (A, B, C, etc.)
 * @returns {Object|null} Sub-slot object or null
 */
export function getSubSlotById(timeSlot, subSlotId) {
  if (!timeSlot.subSlots || timeSlot.subSlots.length === 0) {
    return null;
  }

  return (
    timeSlot.subSlots.find((subSlot) => subSlot.subSlotId === subSlotId) || null
  );
}

/**
 * Get all bookings for a specific sub-slot
 * @param {String} slotId - TimeSlot ID
 * @param {String} subSlotId - Sub-slot ID
 * @returns {Promise<Array>} Array of ActivityBooking documents
 */
export async function getSubSlotBookings(slotId, subSlotId) {
  try {
    const bookings = await ActivityBooking.find({
      slotId,
      subSlotId,
      status: { $ne: "CANCELLED" },
    }).sort({ createdAt: 1 });

    return bookings;
  } catch (error) {
    console.error("[SubSlotService] Error getting sub-slot bookings:", error);
    throw error;
  }
}

/**
 * Recalculate sub-slot capacity from bookings
 * @param {Object} timeSlot - TimeSlot document
 * @param {String} subSlotId - Sub-slot ID
 * @returns {Promise<Object>} Updated sub-slot
 */
export async function recalculateSubSlotCapacity(timeSlot, subSlotId) {
  try {
    const subSlot = getSubSlotById(timeSlot, subSlotId);

    if (!subSlot) {
      throw new Error(
        `Sub-slot ${subSlotId} not found in time slot ${timeSlot._id}`,
      );
    }

    // Get all bookings for this sub-slot
    const bookings = await getSubSlotBookings(timeSlot._id, subSlotId);

    // Recalculate passenger count
    const totalPassengers = bookings.reduce((sum, booking) => {
      return sum + (booking.totalPassengers || 0);
    }, 0);

    // Update booking IDs
    subSlot.bookingIds = bookings.map((b) => b._id);
    subSlot.currentPassengerCount = totalPassengers;

    // Update status
    if (totalPassengers === 0) {
      subSlot.status = "UNASSIGNED";
    } else if (totalPassengers >= subSlot.maxCapacity) {
      subSlot.status = "FULL";
    } else if (subSlot.assignedGuideId) {
      subSlot.status = "ASSIGNED";
    }

    await timeSlot.save();

    console.log(
      `[SubSlotService] Recalculated sub-slot ${subSlotId} capacity: ${totalPassengers}/${subSlot.maxCapacity} passengers`,
    );

    return subSlot;
  } catch (error) {
    console.error(
      "[SubSlotService] Error recalculating sub-slot capacity:",
      error,
    );
    throw error;
  }
}

export default {
  processBookingWithSubSlots,
  getSubSlotById,
  getSubSlotBookings,
  recalculateSubSlotCapacity,
  generateSubSlotId,
  createNewSubSlot,
  initializeFirstSubSlot,
  findSubSlotWithCapacity,
  createAdditionalSubSlot,
  assignBookingToSubSlot,
};
