import mongoose from 'mongoose';

const receiptSchema = new mongoose.Schema({
  // Slot and sub-slot references
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeSlot',
    required: true,
    index: true
  },
  subSlotId: {
    type: String,
    default: null,
    index: true
  },
  
  // Guide information
  guideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guide',
    required: true
  },
  guideName: {
    type: String,
    required: true
  },
  
  // File metadata
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['image/jpeg', 'image/png']
  },
  fileUrl: {
    type: String,
    required: true
  },
  
  // Receipt details
  notes: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  
  // Verification fields for admin approval
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: Date,
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
receiptSchema.index({ slotId: 1, subSlotId: 1 });
receiptSchema.index({ guideId: 1 });
receiptSchema.index({ verificationStatus: 1 });
receiptSchema.index({ uploadedAt: 1 });

export default mongoose.model('Receipt', receiptSchema);
