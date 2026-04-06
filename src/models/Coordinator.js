import mongoose from 'mongoose';

const coordinatorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  assignedProducts: [{
    type: Number, // Bokun product IDs
    required: true
  }]
}, {
  timestamps: true
});

// Index for quick lookups
coordinatorSchema.index({ userId: 1 });
coordinatorSchema.index({ email: 1 });

export default mongoose.model('Coordinator', coordinatorSchema);
