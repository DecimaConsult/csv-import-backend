import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true,
    index: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['ADMIN', 'STAFF', 'COORDINATOR', 'GUIDE'], 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  disabledAt: {
    type: Date,
    default: null
  },
  disabledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  disableReason: {
    type: String,
    default: null
  }
}, { 
  timestamps: true 
});

// Index for authentication queries
userSchema.index({ email: 1 });
userSchema.index({ isActive: 1 });

export default mongoose.model('User', userSchema);
