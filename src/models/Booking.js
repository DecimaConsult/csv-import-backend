import mongoose from "mongoose";
import { eiffelConnection } from "../config/database.js";

const bookingSchema = new mongoose.Schema(
  {
    // Root level booking info
    bookingId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    confirmationCode: {
      type: String,
      required: true,
    },
    externalBookingReference: String,
    status: {
      type: String,
      required: true,
      // NO ENUM - Accept any status from Bokun to prevent data loss
    },
    language: String,
    creationDate: Date,

    // Pricing at booking level
    currency: String,
    totalPrice: Number,
    totalPaid: Number,
    totalDue: Number,
    paymentType: String,

    // Customer information
    customerId: Number,
    firstName: String,
    lastName: String,
    email: String,
    phoneNumber: String,
    phoneNumberLinkable: String,

    // Booking channel info
    bookingChannelId: Number,
    bookingChannelTitle: String,

    // Seller/Platform info
    sellerId: Number,
    sellerTitle: String,

    // Raw webhook payload (for debugging/backup)
    rawWebhookPayload: mongoose.Schema.Types.Mixed,

    // Metadata
    bokunWebhookTimestamp: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes for query optimization
bookingSchema.index({ confirmationCode: 1 });
bookingSchema.index({ email: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ creationDate: -1 });
const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;

// ✅ SAFE LAZY MODEL
export const getBookingEiffelModel = () => {
  if (!eiffelConnection) {
    console.log("❌ Eiffel connection not ready (Booking)");
    return null;
  }

  if (eiffelConnection.models.Booking) {
    return eiffelConnection.models.Booking;
  }

  console.log("✅ Creating Eiffel Booking model");

  return eiffelConnection.model("Booking", bookingSchema);
};
