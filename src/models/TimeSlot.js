import mongoose from "mongoose";

// Sub-slot schema definition
const subSlotSchema = new mongoose.Schema(
  {
    subSlotId: {
      type: String,
      required: true,
    },
    subSlotNumber: {
      type: Number,
      required: true,
    },
    maxCapacity: {
      type: Number,
      default: 25,
    },
    currentPassengerCount: {
      type: Number,
      default: 0,
    },
    assignedGuideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guide",
    },
    assignedGuideName: String,
    status: {
      type: String,
      enum: ["UNASSIGNED", "ASSIGNED", "FULL", "COMPLETED"],
      default: "UNASSIGNED",
    },
    bookingIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ActivityBooking",
      },
    ],
    ticketCostCalculation: {
      adults: {
        count: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      },
      youth: {
        count: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      },
      children: {
        count: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      },
      total: { type: Number, default: 0 },
    },
    receiptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receipt",
    },
    // Ticket file reference
    ticketFile: {
      fileName: String,
      fileSize: Number,
      mimeType: String,
      fileUrl: String,
      uploadedAt: Date,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    // Google Calendar event ID
    calendarEventId: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const timeSlotSchema = new mongoose.Schema(
  {
    // Product/Activity identifier
    productId: {
      type: Number,
      required: true,
    },
    productTitle: {
      type: String,
      required: true,
    },

    // Timing
    startDateTime: {
      type: Date,
      required: true,
    },
    endDateTime: Date,

    // Sub-slot configuration
    requiresSubSlots: {
      type: Boolean,
      default: false,
    },

    // Sub-slots array (used when requiresSubSlots = true)
    subSlots: [subSlotSchema],

    // Root-level fields (used when requiresSubSlots = false)
    // Maintained for backward compatibility with existing slots
    maxCapacity: {
      type: Number,
      default: 25,
    },
    currentPassengerCount: {
      type: Number,
      default: 0,
    },
    bookingCount: {
      type: Number,
      default: 0,
    },

    // Guide assignment (root-level, for non-sub-slot products)
    assignedGuideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guide",
    },
    assignedGuideName: String,

    // Slot status (root-level, for non-sub-slot products)
    status: {
      type: String,
      enum: ["UNASSIGNED", "ASSIGNED", "FULL", "CANCELLED", "EMPTY"],
      default: "UNASSIGNED",
    },

    // Ticket cost calculation (root-level, for non-sub-slot products)
    ticketCostCalculation: {
      adults: {
        count: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      },
      youth: {
        count: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      },
      children: {
        count: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
      },
      total: { type: Number, default: 0 },
    },

    // Receipt reference (root-level, for non-sub-slot products)
    receiptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receipt",
    },

    // Ticket file reference (root-level, for non-sub-slot products)
    ticketFile: {
      fileName: String,
      fileSize: Number,
      mimeType: String,
      fileUrl: String,
      uploadedAt: Date,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },

    // Google Calendar event ID (root-level, for non-sub-slot products)
    calendarEventId: {
      type: String,
      default: null,
    },

    // Split slot tracking (legacy fields, maintained for backward compatibility)
    isSplitSlot: {
      type: Boolean,
      default: false,
    },
    parentSlotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TimeSlot",
    },

    // Auto-slot creation info
    createdReason: {
      type: String,
      enum: ["initial", "capacity_exceeded"],
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for slot lookup (critical for performance)
timeSlotSchema.index({ productId: 1, startDateTime: 1 });
timeSlotSchema.index({ assignedGuideId: 1 });
timeSlotSchema.index({ status: 1 });
timeSlotSchema.index({ startDateTime: 1 });
// Index for sub-slot guide assignments
timeSlotSchema.index({ "subSlots.assignedGuideId": 1 });

export default mongoose.model("TimeSlot", timeSlotSchema);
