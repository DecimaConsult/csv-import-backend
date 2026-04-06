import mongoose from "mongoose";
import { eiffelConnection } from "../config/database.js";

const activityBookingSchema = new mongoose.Schema(
  {
    // Booking reference
    parentBookingId: {
      type: Number,
      required: true,
      index: true,
    },
    bookingId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    // Confirmation
    confirmationCode: String,
    productConfirmationCode: String,

    // Status
    status: {
      type: String,
      enum: ["CONFIRMED", "PENDING", "CANCELLED"],
      required: true,
    },

    // Customer information (from parent booking)
    customerName: String,
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    phoneNumberLinkable: String,

    // Tour/Product details
    productId: {
      type: Number,
      required: true,
    },
    productTitle: {
      type: String,
      required: true,
    },
    externalProductId: String,
    rateTitle: String,
    productCategory: String,

    // Supplier/Vendor info
    supplierId: Number,
    supplierTitle: String,
    supplierEmail: String,
    supplierPhone: String,
    supplierWebsite: String,

    // Tour timing
    startDateTime: {
      type: Date,
      required: true,
    },
    endDateTime: Date,
    durationHours: Number,
    durationMinutes: Number,

    // Pricing
    totalPrice: Number,
    priceWithDiscount: Number,
    currency: String,

    // Passenger information (from pricingCategoryBookings)
    passengers: [
      {
        pricingCategoryId: Number,
        category: {
          type: String,
          enum: [
            "Adult",
            "Child",
            "Infant",
            "Youth",
            "ADULT",
            "CHILD",
            "INFANT",
            "YOUTH",
          ],
        },
        quantity: Number,
        ageMin: Number,
        ageMax: Number,
        passengerInfo: {
          passengerInfoId: Number,
          firstName: String,
          lastName: String,
          leadPassenger: Boolean,
        },
        // Check-in tracking
        checkInStatus: {
          isCheckedIn: {
            type: Boolean,
            default: false,
          },
          checkedInAt: Date,
          checkedInBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Guide",
          },
          checkedInByName: String,
        },
      },
    ],

    // Calculated passenger totals
    totalAdults: {
      type: Number,
      default: 0,
    },
    totalYouth: {
      type: Number,
      default: 0,
    },
    totalChildren: {
      type: Number,
      default: 0,
    },
    totalInfants: {
      type: Number,
      default: 0,
    },
    totalPassengers: {
      type: Number,
      required: true,
    },

    // Booking answers/custom fields
    bookingAnswers: [mongoose.Schema.Types.Mixed],

    // Slot assignment
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TimeSlot",
    },
    subSlotId: {
      type: String,
      default: null,
    },
    guideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guide",
    },

    // Booking-level check-in status (for entire booking)
    checkInStatus: {
      isCheckedIn: {
        type: Boolean,
        default: false,
      },
      checkedInAt: Date,
      checkedInBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      checkedInByName: String,
    },

    // Booking source tracking
    bookingSource: {
      type: String,
      enum: [
        "VIATOR",
        "WEBSITE",
        "DIRECT",
        "GETYOURGUIDE",
        "TRIPADVISOR",
        "OTHER",
        "UNKNOWN",
      ],
      default: "UNKNOWN",
    },

    // Customer-selected options and extras
    selectedOptions: [
      {
        optionId: String,
        name: String,
        quantity: {
          type: Number,
          default: 1,
        },
        price: Number,
      },
    ],

    // Additional info
    barcode: String,
    description: String,
    cancellationPolicy: mongoose.Schema.Types.Mixed,
    cancellationPolicyTitle: String,
    included: String,
    excluded: String,
    attention: String,
  },
  {
    timestamps: true,
  },
);

// Indexes for query optimization
activityBookingSchema.index({ productId: 1, startDateTime: 1 });
activityBookingSchema.index({ slotId: 1 });
activityBookingSchema.index({ slotId: 1, subSlotId: 1 });
activityBookingSchema.index({ guideId: 1 });
activityBookingSchema.index({ status: 1 });
activityBookingSchema.index({ startDateTime: 1 });
activityBookingSchema.index({ bookingSource: 1 });
activityBookingSchema.index({ "passengers.checkInStatus.isCheckedIn": 1 });

const ActivityBooking = mongoose.model(
  "ActivityBooking",
  activityBookingSchema,
);

export default ActivityBooking;

// ✅ SAFE LAZY MODEL
export const getActivityBookingEiffelModel = () => {
  if (!eiffelConnection) {
    console.log("❌ Eiffel connection not ready (ActivityBooking)");
    return null;
  }

  if (eiffelConnection.models.ActivityBooking) {
    return eiffelConnection.models.ActivityBooking;
  }

  console.log("✅ Creating Eiffel ActivityBooking model");

  return eiffelConnection.model("ActivityBooking", activityBookingSchema);
};
