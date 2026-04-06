import mongoose from "mongoose";
import Booking, { getBookingEiffelModel } from "../models/Booking.js";
import ActivityBooking, {
  getActivityBookingEiffelModel,
} from "../models/ActivityBooking.js";

/**
 * Booking Service
 * Handles extraction and storage of booking data from Bokun webhooks
 */

/**
 * Extract root-level booking data from webhook payload
 * @param {Object} payload - Webhook payload
 * @returns {Object} Extracted booking data
 */
function mapStatus(status) {
  if (!status) return "CONFIRMED";

  const s = status.toUpperCase();

  if (s === "CANCELLED") return "CANCELLED";
  if (s === "ARRIVED") return "CONFIRMED"; // ✅ fix crash
  if (s === "REDEEMED") return "CONFIRMED";

  return "CONFIRMED";
}

export function extractBookingData(payload) {
  return {
    bookingId: payload.bookingId,
    confirmationCode: payload.confirmationCode,
    externalBookingReference: payload.externalBookingReference,
    status: mapStatus(payload.status),
    language: payload.language,
    creationDate: payload.creationDate ? new Date(payload.creationDate) : null,

    // Pricing
    currency: payload.currency,
    totalPrice: payload.totalPrice,
    totalPaid: payload.totalPaid,
    totalDue: payload.totalDue,
    paymentType: payload.paymentType,

    // Customer information
    customerId: payload.customer?.id,
    customerName:
      payload.customer?.firstName && payload.customer?.lastName
        ? `${payload.customer.firstName} ${payload.customer.lastName}`
        : null,
    firstName: payload.customer?.firstName,
    lastName: payload.customer?.lastName,
    email: payload.customer?.email,
    phoneNumber: payload.customer?.phoneNumber,
    phoneNumberLinkable: payload.customer?.phoneNumberLinkable,

    // Booking channel
    bookingChannelId: payload.bookingChannel?.id,
    bookingChannelTitle: payload.bookingChannel?.title,

    // Seller
    sellerId: payload.seller?.id,
    sellerTitle: payload.seller?.title,

    // Raw payload for debugging
    rawWebhookPayload: payload,
    bokunWebhookTimestamp: new Date(),
  };
}

/**
 * Extract booking source from webhook payload
 * Maps various source identifiers to standardized values
 * @param {Object} payload - Webhook payload
 * @returns {String} Booking source (VIATOR, WEBSITE, DIRECT, etc.)
 */
export function extractBookingSource(payload) {
  // Check booking channel
  const channelTitle = payload.bookingChannel?.title?.toUpperCase() || "";
  const channelId = payload.bookingChannel?.id;

  // Check seller information
  const sellerTitle = payload.seller?.title?.toUpperCase() || "";

  // Map to standardized booking sources
  if (channelTitle.includes("VIATOR") || sellerTitle.includes("VIATOR")) {
    return "VIATOR";
  } else if (
    channelTitle.includes("GETYOURGUIDE") ||
    sellerTitle.includes("GETYOURGUIDE")
  ) {
    return "GETYOURGUIDE";
  } else if (
    channelTitle.includes("TRIPADVISOR") ||
    sellerTitle.includes("TRIPADVISOR")
  ) {
    return "TRIPADVISOR";
  } else if (
    channelTitle.includes("WEBSITE") ||
    channelTitle.includes("WEB") ||
    channelId === 1
  ) {
    return "WEBSITE";
  } else if (
    channelTitle.includes("DIRECT") ||
    channelTitle.includes("PHONE") ||
    channelTitle.includes("EMAIL")
  ) {
    return "DIRECT";
  } else if (channelTitle || sellerTitle) {
    return "OTHER";
  }

  return "UNKNOWN";
}

/**
 * Extract activity booking data from activityBookings array
 * @param {Object} activityData - Single activity booking from activityBookings array
 * @param {Number} parentBookingId - Parent booking ID
 * @param {Object} webhookPayload - Complete webhook payload for extracting booking source
 * @returns {Object} Extracted activity booking data
 */
export function extractActivityBookingData(
  activityData,
  parentBookingId,
  webhookPayload = null,
) {
  const data = {
    parentBookingId,
    bookingId: activityData.bookingId,

    // Confirmation
    confirmationCode: activityData.confirmationCode,
    productConfirmationCode: activityData.productConfirmationCode,

    // Status
    status: mapStatus(activityData.status),

    // Customer information (from parent webhook payload)
    customerName:
      webhookPayload?.customer?.firstName && webhookPayload?.customer?.lastName
        ? `${webhookPayload.customer.firstName} ${webhookPayload.customer.lastName}`
        : null,
    firstName: webhookPayload?.customer?.firstName,
    lastName: webhookPayload?.customer?.lastName,
    email: webhookPayload?.customer?.email,
    phone: webhookPayload?.customer?.phoneNumber,
    phoneNumberLinkable: webhookPayload?.customer?.phoneNumberLinkable,

    // Product details
    productId: activityData.product?.id || activityData.productId,
    productTitle: activityData.product?.title || activityData.title,
    externalProductId: activityData.product?.externalId,
    rateTitle: activityData.rateTitle,
    productCategory: activityData.productCategory,

    // Supplier
    supplierId: activityData.supplier?.id,
    supplierTitle: activityData.supplier?.title,
    supplierEmail: activityData.supplier?.emailAddress,
    supplierPhone: activityData.supplier?.phoneNumber,
    supplierWebsite: activityData.supplier?.website,

    // Timing - support both Bokun formats
    startDateTime: activityData.startDateTime
      ? new Date(activityData.startDateTime)
      : activityData.startTimeLocal
        ? new Date(activityData.startTimeLocal)
        : null,
    endDateTime: activityData.endDateTime
      ? new Date(activityData.endDateTime)
      : activityData.endTimeLocal
        ? new Date(activityData.endTimeLocal)
        : null,
    durationHours:
      activityData.activity?.durationHours || activityData.durationHours,
    durationMinutes:
      activityData.activity?.durationMinutes || activityData.durationMinutes,

    // Pricing
    totalPrice: activityData.totalPrice,
    priceWithDiscount: activityData.priceWithDiscount,
    currency:
      activityData.activity?.vendor?.currencyCode || activityData.currency,

    // Booking answers
    bookingAnswers: activityData.bookingAnswers || activityData.answers || [],

    // Additional info
    barcode: activityData.barcode?.value,
    description: activityData.activity?.description,
    cancellationPolicy:
      activityData.activity?.cancellationPolicy ||
      activityData.cancellationPolicy,
    cancellationPolicyTitle:
      activityData.activity?.cancellationPolicy?.title ||
      activityData.cancellationPolicy?.title,
    included: activityData.activity?.included,
    excluded: activityData.activity?.excluded,
    attention: activityData.activity?.attention,
  };

  // Extract booking source from webhook payload
  if (webhookPayload) {
    data.bookingSource = extractBookingSource(webhookPayload);
  }

  // Extract customer-selected options if available
  if (activityData.extras && Array.isArray(activityData.extras)) {
    data.selectedOptions = activityData.extras.map((extra) => ({
      optionId: extra.id || extra.extraId,
      name: extra.title || extra.name,
      quantity: extra.quantity || 1,
      price: extra.price,
    }));
  }

  // Extract passenger information from pricingCategoryBookings
  if (
    activityData.pricingCategoryBookings &&
    Array.isArray(activityData.pricingCategoryBookings)
  ) {
    data.passengers = [];

    // Iterate through each pricing category booking
    activityData.pricingCategoryBookings.forEach((pcb) => {
      const category =
        pcb.pricingCategory?.ticketCategory ||
        (pcb.pricingCategory?.title === "Adult"
          ? "Adult"
          : pcb.pricingCategory?.title === "Child"
            ? "Child"
            : pcb.pricingCategory?.title === "Infant"
              ? "Infant"
              : pcb.pricingCategory?.title === "Youth"
                ? "Youth"
                : pcb.pricingCategory?.title);

      // Handle passengerInfos array (Bokun format with multiple passengers per category)
      if (
        pcb.passengerInfos &&
        Array.isArray(pcb.passengerInfos) &&
        pcb.passengerInfos.length > 0
      ) {
        pcb.passengerInfos.forEach((passengerInfo) => {
          data.passengers.push({
            pricingCategoryId: pcb.pricingCategoryId,
            category,
            quantity: 1, // Each passenger is individual
            ageMin: pcb.pricingCategory?.minAge,
            ageMax: pcb.pricingCategory?.maxAge,
            passengerInfo: {
              passengerInfoId:
                passengerInfo.passengerInfoId || passengerInfo.id,
              firstName: passengerInfo.firstName,
              lastName: passengerInfo.lastName,
              leadPassenger: passengerInfo.leadPassenger || false,
            },
          });
        });
      }
      // Handle single passengerInfo (alternative format)
      else if (pcb.passengerInfo) {
        data.passengers.push({
          pricingCategoryId: pcb.pricingCategoryId,
          category,
          quantity: pcb.quantity,
          ageMin: pcb.pricingCategory?.minAge,
          ageMax: pcb.pricingCategory?.maxAge,
          passengerInfo: {
            passengerInfoId: pcb.passengerInfo.id,
            firstName: pcb.passengerInfo.firstName,
            lastName: pcb.passengerInfo.lastName,
            leadPassenger: pcb.leadPassenger || false,
          },
        });
      }
      // No passenger info - create entry with quantity only
      else {
        data.passengers.push({
          pricingCategoryId: pcb.pricingCategoryId,
          category,
          quantity: pcb.quantity,
          ageMin: pcb.pricingCategory?.minAge,
          ageMax: pcb.pricingCategory?.maxAge,
          passengerInfo: null,
        });
      }
    });

    // Calculate passenger totals
    const totals = calculatePassengerTotals(
      activityData.pricingCategoryBookings,
    );
    data.totalAdults = totals.totalAdults;
    data.totalYouth = totals.totalYouth;
    data.totalChildren = totals.totalChildren;
    data.totalInfants = totals.totalInfants;
    data.totalPassengers = totals.totalPassengers;
  } else {
    // Fallback if no pricingCategoryBookings
    data.passengers = [];
    data.totalAdults = 0;
    data.totalYouth = 0;
    data.totalChildren = 0;
    data.totalInfants = 0;
    data.totalPassengers = activityData.totalParticipants || 0;
  }

  return data;
}

/**
 * Calculate passenger totals from pricingCategoryBookings
 * @param {Array} pricingCategoryBookings - Array of pricing category bookings
 * @returns {Object} Passenger totals
 */
export function calculatePassengerTotals(pricingCategoryBookings) {
  let totalAdults = 0;
  let totalYouth = 0;
  let totalChildren = 0;
  let totalInfants = 0;

  if (!pricingCategoryBookings || !Array.isArray(pricingCategoryBookings)) {
    return {
      totalAdults: 0,
      totalYouth: 0,
      totalChildren: 0,
      totalInfants: 0,
      totalPassengers: 0,
    };
  }

  pricingCategoryBookings.forEach((pcb) => {
    const category =
      pcb.pricingCategory?.ticketCategory || pcb.pricingCategory?.title;
    const quantity = pcb.quantity || 0;

    if (category === "ADULT" || category === "Adult") {
      totalAdults += quantity;
    } else if (category === "YOUTH" || category === "Youth") {
      totalYouth += quantity;
    } else if (category === "CHILD" || category === "Child") {
      totalChildren += quantity;
    } else if (category === "INFANT" || category === "Infant") {
      totalInfants += quantity;
    }
  });

  const totalPassengers =
    totalAdults + totalYouth + totalChildren + totalInfants;

  return {
    totalAdults,
    totalYouth,
    totalChildren,
    totalInfants,
    totalPassengers,
  };
}

/**
 * Create or update booking with activity bookings
 * @param {Object} webhookPayload - Complete webhook payload
 * @param {Function} slotAssignmentCallback - Optional callback to assign slots (will be implemented in task 5)
 * @returns {Promise<Object>} Created/updated booking
 */
export async function createOrUpdateBooking(
  webhookPayload,
  slotAssignmentCallback = null,
) {
  try {
    // Extract root booking data
    const bookingData = extractBookingData(webhookPayload);

    // Upsert booking document
    const booking = await Booking.findOneAndUpdate(
      { bookingId: bookingData.bookingId },
      bookingData,
      { upsert: true, new: true, runValidators: true },
    );

    const BookingEiffel = getBookingEiffelModel();
    const ActivityBookingEiffel = getActivityBookingEiffelModel();

    if (!BookingEiffel) {
      console.log("❌ Eiffel model not available");
    } else {
      console.log("✅ Writing to Eiffel DB");

      try {
        await BookingEiffel.findOneAndUpdate(
          { bookingId: bookingData.bookingId },
          bookingData,
          { upsert: true, new: true },
        );
      } catch (err) {
        console.error("❌ Eiffel DB write failed (Booking):", err.message);
      }
    }
    // ✅ WRITE TO EIFFEL DB (SAFE)

    // Process each activity booking
    if (
      webhookPayload.activityBookings &&
      Array.isArray(webhookPayload.activityBookings)
    ) {
      for (const activityData of webhookPayload.activityBookings) {
        // ALWAYS build fresh data
        const activityBookingData = extractActivityBookingData(
          activityData,
          booking.bookingId,
          webhookPayload,
        );

        // ALWAYS UPSERT FIRST (NO SKIP)
        const activityBooking = await ActivityBooking.findOneAndUpdate(
          { bookingId: activityBookingData.bookingId },
          { $set: activityBookingData },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );

        // ONLY skip SLOT ASSIGNMENT (not DB update)
        if (activityBooking.slotId) {
          console.log("⏭️ Slot already assigned:", activityBooking.bookingId);
        } else if (slotAssignmentCallback) {
          await slotAssignmentCallback(activityBooking);
        }

        // ✅ WRITE TO EIFFEL DB
        const ActivityBookingEiffel = getActivityBookingEiffelModel();

        if (ActivityBookingEiffel) {
          console.log("✅ Writing ActivityBooking to Eiffel DB");

          try {
            await ActivityBookingEiffel.findOneAndUpdate(
              { bookingId: activityBookingData.bookingId },
              activityBookingData,
              { upsert: true, new: true },
            );
          } catch (err) {
            console.error(
              "❌ Eiffel DB write failed (ActivityBooking):",
              err.message,
            );
          }
        } else {
          console.log("❌ ActivityBooking Eiffel model not available");
        }

        console.log(
          `[BookingService] ActivityBooking ${activityBooking.bookingId} created/updated with ${activityBooking.totalPassengers} passengers (source: ${activityBooking.bookingSource})`,
        );

        // Trigger slot assignment if callback provided (will be used in task 5)
        if (
          slotAssignmentCallback &&
          typeof slotAssignmentCallback === "function"
        ) {
          if (!activityBooking.slotId) {
            await slotAssignmentCallback(activityBooking);
          } else {
            console.log(
              "⏭️ Already has slot, skipping:",
              activityBooking.bookingId,
            );
          }
        }
      }
    }

    return booking;
  } catch (error) {
    console.error("[BookingService] Error creating/updating booking:", error);
    throw error;
  }
}

/**
 * Handle booking cancellation
 * @param {Number} bookingId - Booking ID to cancel
 * @param {Function} slotRecalculationCallback - Optional callback to recalculate slot capacity
 * @returns {Promise<Object>} Updated booking
 */
export async function handleBookingCancellation(
  bookingId,
  slotRecalculationCallback = null,
) {
  try {
    // Update booking status
    const booking = await Booking.findOneAndUpdate(
      { bookingId },
      { $set: { status: "CANCELLED" } },
      { new: true },
    );

    if (!booking) {
      // Booking doesn't exist in our system - this can happen if:
      // 1. The create webhook failed or never arrived
      // 2. Webhooks arrived out of order
      // 3. This was a test booking in Bokun
      console.log(
        `[BookingService] Booking ${bookingId} not found for cancellation - may not have been synced yet`,
      );

      // Return null instead of throwing - this is not an error condition
      // The webhook should be marked as SUCCESS since we handled it appropriately
      return null;
    }

    console.log(`[BookingService] Booking ${bookingId} cancelled`);

    // Update all activity bookings
    const activityBookings = await ActivityBooking.find({
      parentBookingId: bookingId,
    });

    for (const activityBooking of activityBookings) {
      activityBooking.status = "CANCELLED";
      await activityBooking.save();

      console.log(
        `[BookingService] ActivityBooking ${activityBooking.bookingId} cancelled`,
      );

      // Trigger slot recalculation if callback provided (will be used in task 5)
      if (
        slotRecalculationCallback &&
        typeof slotRecalculationCallback === "function"
      ) {
        await slotRecalculationCallback(activityBooking);
      }
    }

    return booking;
  } catch (error) {
    console.error("[BookingService] Error cancelling booking:", error);
    throw error;
  }
}

export default {
  extractBookingData,
  extractActivityBookingData,
  extractBookingSource,
  calculatePassengerTotals,
  createOrUpdateBooking,
  handleBookingCancellation,
};
