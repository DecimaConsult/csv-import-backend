import mongoose from 'mongoose';

const calendarInvitationSchema = new mongoose.Schema({
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  slotType: {
    type: String,
    enum: ['TimeSlot', 'SubSlot'],
    required: true
  },
  guideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guide',
    required: true,
    index: true
  },
  calendarEventId: {
    type: String,
    default: null  // Null if calendar conflict prevented invite
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'calendar_conflict'],
    default: 'pending',
    index: true
  },
  invitedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date,
    default: null
  },
  channelId: {
    type: String,
    default: null  // Null if calendar conflict prevented invite
  },
  resourceId: {
    type: String,
    default: null  // Null if calendar conflict prevented invite
  },
  expiresAt: {
    type: Date,
    default: null  // Null if calendar conflict prevented invite
  },
  conflictReason: {
    type: String,
    default: null  // Description of calendar conflict if detected
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
calendarInvitationSchema.index({ slotId: 1, guideId: 1 });
calendarInvitationSchema.index({ status: 1, expiresAt: 1 });

export default mongoose.model('CalendarInvitation', calendarInvitationSchema);
