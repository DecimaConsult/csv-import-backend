import mongoose from 'mongoose';

const webhookLogSchema = new mongoose.Schema({
  // Webhook timing
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  
  // Webhook headers
  bokunTopic: String,
  bokunBookingId: Number,
  bokunVendorId: Number,
  
  // Raw data
  rawPayload: mongoose.Schema.Types.Mixed,
  
  // Processing result
  processedStatus: { 
    type: String, 
    enum: ['RECEIVED', 'PENDING', 'SUCCESS', 'FAILED'],
    default: 'RECEIVED'
  },
  errorMessage: String,
  processingDurationMs: Number,
  
  // Activity booking info (if applicable)
  activityBookingId: Number,
}, { 
  timestamps: true 
});

// Indexes for query optimization
webhookLogSchema.index({ timestamp: -1 });
webhookLogSchema.index({ bokunBookingId: 1 });
webhookLogSchema.index({ processedStatus: 1 });
webhookLogSchema.index({ bokunTopic: 1 });

export default mongoose.model('WebhookLog', webhookLogSchema);
