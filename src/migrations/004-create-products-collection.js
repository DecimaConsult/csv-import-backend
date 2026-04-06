/**
 * Migration: Create Products collection with initial data
 * 
 * This migration creates the Products collection and seeds it with initial tour products:
 * - Eiffel Tower Tour
 * - Louvre Museum Tour
 * - Notre Dame Tour
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

// Load environment variables
dotenv.config({ path: './backend/.env' });

const initialProducts = [
  {
    productId: '1',
    name: 'Eiffel Tower Tour',
    description: 'Guided tour of the iconic Eiffel Tower with skip-the-line access',
    requiresSubSlots: true,
    subSlotCapacity: 25,
    ticketPricing: {
      adult: 35.00,
      youth: 25.00,
      child: 15.00
    },
    availableOptions: [
      {
        optionId: 'summit-access',
        name: 'Summit Access',
        price: 10.00
      },
      {
        optionId: 'audio-guide',
        name: 'Audio Guide',
        price: 5.00
      }
    ],
    active: true
  },
  {
    productId: '2',
    name: 'Louvre Museum Tour',
    description: 'Comprehensive guided tour of the world-famous Louvre Museum',
    requiresSubSlots: true,
    subSlotCapacity: 25,
    ticketPricing: {
      adult: 45.00,
      youth: 35.00,
      child: 20.00
    },
    availableOptions: [
      {
        optionId: 'extended-tour',
        name: 'Extended Tour (4 hours)',
        price: 15.00
      },
      {
        optionId: 'private-guide',
        name: 'Private Guide Upgrade',
        price: 50.00
      }
    ],
    active: true
  },
  {
    productId: '3',
    name: 'Notre Dame Tour',
    description: 'Historical tour of Notre Dame Cathedral and surrounding area',
    requiresSubSlots: true,
    subSlotCapacity: 25,
    ticketPricing: {
      adult: 30.00,
      youth: 20.00,
      child: 12.00
    },
    availableOptions: [
      {
        optionId: 'tower-climb',
        name: 'Tower Climb Access',
        price: 8.00
      }
    ],
    active: true
  }
];

async function up() {
  console.log('Starting migration: Create Products collection...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    // Check if Products collection already exists and has data
    const existingCount = await Product.countDocuments();
    
    if (existingCount > 0) {
      console.log(`⚠ Products collection already exists with ${existingCount} documents`);
      console.log('  Skipping initial data seeding to avoid duplicates');
      console.log('✓ Migration completed (no changes needed)');
      return true;
    }
    
    // Insert initial products
    const result = await Product.insertMany(initialProducts);
    
    console.log(`✓ Created Products collection`);
    console.log(`✓ Inserted ${result.length} initial products:`);
    result.forEach(product => {
      console.log(`  - ${product.name} (ID: ${product.productId})`);
      console.log(`    • Sub-slots: ${product.requiresSubSlots ? 'Enabled' : 'Disabled'}`);
      console.log(`    • Pricing: Adult €${product.ticketPricing.adult}, Youth €${product.ticketPricing.youth}, Child €${product.ticketPricing.child}`);
    });
    
    // Verify the migration
    const totalProducts = await Product.countDocuments();
    
    console.log(`\nVerification:`);
    console.log(`  - Total Products: ${totalProducts}`);
    
    if (totalProducts === initialProducts.length) {
      console.log('✓ Migration completed successfully!');
      return true;
    } else {
      console.error('✗ Migration incomplete - product count mismatch');
      return false;
    }
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Starting rollback: Remove Products collection...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    // Only remove the initial products we created
    const productIds = initialProducts.map(p => p.productId);
    const result = await Product.deleteMany({ 
      productId: { $in: productIds } 
    });
    
    console.log(`✓ Removed ${result.deletedCount} initial products`);
    
    // Check if collection is now empty
    const remainingCount = await Product.countDocuments();
    
    if (remainingCount === 0) {
      console.log('✓ Products collection is now empty');
      // Note: MongoDB will automatically drop empty collections
    } else {
      console.log(`⚠ ${remainingCount} products remain in collection (not created by this migration)`);
    }
    
    console.log('✓ Rollback completed successfully!');
    return true;
  } catch (error) {
    console.error('✗ Rollback failed:', error.message);
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'up';
  
  try {
    if (command === 'up') {
      await up();
    } else if (command === 'down') {
      await down();
    } else {
      console.error('Invalid command. Use "up" or "down"');
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

export { up, down };
