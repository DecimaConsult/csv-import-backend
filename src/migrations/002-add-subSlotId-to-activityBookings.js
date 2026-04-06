/**
 * Migration: Add subSlotId field to existing ActivityBookings
 * 
 * This migration adds the subSlotId field to all existing ActivityBooking documents.
 * By default, existing bookings are set to subSlotId: null to maintain backward compatibility.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ActivityBooking from '../models/ActivityBooking.js';

// Load environment variables
dotenv.config({ path: './backend/.env' });

async function up() {
  console.log('Starting migration: Add subSlotId to ActivityBookings...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    // Find all ActivityBookings that don't have the subSlotId field
    const result = await ActivityBooking.updateMany(
      { subSlotId: { $exists: false } },
      { 
        $set: { 
          subSlotId: null
        } 
      }
    );
    
    console.log(`✓ Updated ${result.modifiedCount} ActivityBooking documents`);
    console.log(`  - Set subSlotId: null (backward compatibility)`);
    
    // Verify the migration
    const totalBookings = await ActivityBooking.countDocuments();
    const bookingsWithField = await ActivityBooking.countDocuments({ subSlotId: { $exists: true } });
    
    console.log(`\nVerification:`);
    console.log(`  - Total ActivityBookings: ${totalBookings}`);
    console.log(`  - ActivityBookings with subSlotId field: ${bookingsWithField}`);
    
    if (totalBookings === bookingsWithField) {
      console.log('✓ Migration completed successfully!');
      return true;
    } else {
      console.error('✗ Migration incomplete - some documents missing the field');
      return false;
    }
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Starting rollback: Remove subSlotId from ActivityBookings...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    const result = await ActivityBooking.updateMany(
      {},
      { 
        $unset: { 
          subSlotId: ""
        } 
      }
    );
    
    console.log(`✓ Rolled back ${result.modifiedCount} ActivityBooking documents`);
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
