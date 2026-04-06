import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  // Product identifier (from Bokun)
  productId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Product information
  name: {
    type: String,
    required: false,
    default: 'Unnamed Product'
  },
  nickname: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  
  // External product identifier (from Bokun/Viator)
  externalId: {
    type: String,
    default: ''
  },
  
  // Product duration in minutes
  durationMinutes: {
    type: Number,
    default: 120,  // 2 hours default
    min: 0
  },
  
  // Track if product was auto-created from webhook
  createdFromWebhook: {
    type: Boolean,
    default: false
  },
  
  // Sub-slot configuration
  requiresSubSlots: {
    type: Boolean,
    default: false
  },
  subSlotCapacity: {
    type: Number,
    default: 25,
    min: 1
  },
  
  // Ticket configuration
  requiresTickets: {
    type: Boolean,
    default: false
  },
  
  // Ticket pricing (defaults to 0 if not provided)
  ticketPricing: {
    adult: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    },
    youth: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    },
    child: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    }
  },
  
  // Customer-selectable extras
  availableOptions: [{
    optionId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Product status
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for query optimization
// Note: productId unique index is created by the schema field definition
productSchema.index({ active: 1 });
productSchema.index({ name: 1 });

export default mongoose.model('Product', productSchema);
