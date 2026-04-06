import mongoose from 'mongoose';
import Product from '../models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const initialProducts = [
  {
    productId: 'EIFFEL_TOWER_001',
    name: 'Eiffel Tower Tour',
    description: 'Guided tour of the iconic Eiffel Tower with skip-the-line access',
    requiresSubSlots: true,
    subSlotCapacity: 25,
    ticketPricing: {
      adult: 28.50,
      youth: 22.00,
      child: 14.50
    },
    availableOptions: [
      {
        optionId: 'SUMMIT_ACCESS',
        name: 'Summit Access',
        price: 10.00
      },
      {
        optionId: 'AUDIO_GUIDE',
        name: 'Audio Guide',
        price: 5.00
      }
    ],
    active: true
  },
  {
    productId: 'LOUVRE_MUSEUM_001',
    name: 'Louvre Museum Tour',
    description: 'Comprehensive guided tour of the world-famous Louvre Museum',
    requiresSubSlots: true,
    subSlotCapacity: 25,
    ticketPricing: {
      adult: 22.00,
      youth: 17.00,
      child: 0.00
    },
    availableOptions: [
      {
        optionId: 'EXTENDED_TOUR',
        name: 'Extended Tour (4 hours)',
        price: 15.00
      },
      {
        optionId: 'PRIVATE_GUIDE',
        name: 'Private Guide Upgrade',
        price: 50.00
      }
    ],
    active: true
  },
  {
    productId: 'NOTRE_DAME_001',
    name: 'Notre Dame Cathedral Tour',
    description: 'Historical tour of Notre Dame Cathedral and surrounding area',
    requiresSubSlots: true,
    subSlotCapacity: 25,
    ticketPricing: {
      adult: 15.00,
      youth: 12.00,
      child: 8.00
    },
    availableOptions: [
      {
        optionId: 'TOWER_ACCESS',
        name: 'Tower Access',
        price: 12.00
      },
      {
        optionId: 'CRYPT_VISIT',
        name: 'Archaeological Crypt Visit',
        price: 9.00
      }
    ],
    active: true
  }
];

async function seedProducts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing products
    const deleteResult = await Product.deleteMany({});
    console.log(`Cleared ${deleteResult.deletedCount} existing products`);

    // Insert initial products
    const products = await Product.insertMany(initialProducts);
    console.log(`Successfully seeded ${products.length} products:`);
    
    products.forEach(product => {
      console.log(`  - ${product.name} (${product.productId})`);
      console.log(`    Pricing: Adult €${product.ticketPricing.adult}, Youth €${product.ticketPricing.youth}, Child €${product.ticketPricing.child}`);
      console.log(`    Sub-slots: ${product.requiresSubSlots ? 'Enabled' : 'Disabled'} (Capacity: ${product.subSlotCapacity})`);
      console.log(`    Options: ${product.availableOptions.length} available`);
    });

    console.log('\n✓ Product seeding completed successfully');
  } catch (error) {
    console.error('Error seeding products:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the seed function
seedProducts();
