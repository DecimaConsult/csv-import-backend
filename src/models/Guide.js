import mongoose from 'mongoose';

const guideSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true
  },
  // Keep guideName for backward compatibility
  guideName: { 
    type: String, 
    required: true 
  },
  // Add separate firstName and lastName fields
  firstName: {
    type: String,
    required: false
  },
  lastName: {
    type: String,
    required: false
  },
  email: { 
    type: String, 
    required: true 
  },
  phoneNumber: String,
  
  // Calendar email for receiving calendar invites (optional)
  calendarEmail: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow null/empty
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format for calendar email'
    }
  },
  
  // Guide tier system
  tier: {
    type: String,
    enum: ['PREFERRED', 'STANDARD', 'BACKUP'],
    default: 'STANDARD'
  },
  
  // Product specializations
  productSpecializations: [{
    type: String
  }],
  
  // Availability settings
  availability: [{
    date: { 
      type: Date, 
      required: true 
    },
    startTime: String,
    endTime: String,
    status: { 
      type: String, 
      enum: ['Available', 'Unavailable', 'OnLeave'],
      default: 'Available'
    },
    createdAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  
  // Assigned slots
  assignedSlots: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TimeSlot' 
  }],
}, { 
  timestamps: true 
});

// Indexes for query optimization
guideSchema.index({ userId: 1 });
guideSchema.index({ 'availability.date': 1 });
guideSchema.index({ email: 1 });
guideSchema.index({ tier: 1, guideName: 1 });
guideSchema.index({ productSpecializations: 1 });

export default mongoose.model('Guide', guideSchema);
