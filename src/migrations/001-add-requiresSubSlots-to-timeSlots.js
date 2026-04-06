/**
 * Migration: Add requiresSubSlots field to existing TimeSlots
 * 
 * This migration adds the requiresSubSlots field to all existing TimeSlot documents.
 * By default, existing slots are set to requiresSubSlots: false to maintain backward compatibility.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import TimeSlot from '../models/TimeSlot.js';

// Load environment variables
dotenv.config({ path: './backend/.env' });

async function up() {
  console.log('Starting migration: Add requiresSubSlots to TimeSlots...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    // Find all TimeSlots that don't have the requiresSubSlots field
    const result = await TimeSlot.updateMany(
      { requiresSubSlots: { $exists: false } },
      { 
        $set: { 
          requiresSubSlots: false,
          subSlots: []
        } 
      }
    );
    
    console.log(`✓ Updated ${result.modifiedCount} TimeSlot documents`);
    console.log(`  - Set requiresSubSlots: false (backward compatibility)`);
    console.log(`  - Initialized empty subSlots array`);
    
    // Verify the migration
    const totalSlots = await TimeSlot.countDocuments();
    const slotsWithField = await TimeSlot.countDocuments({ requiresSubSlots: { $exists: true } });
    
    console.log(`\nVerification:`);
    console.log(`  - Total TimeSlots: ${totalSlots}`);
    console.log(`  - TimeSlots with requiresSubSlots field: ${slotsWithField}`);
    
    if (totalSlots === slotsWithField) {
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
  console.log('Starting rollback: Remove requiresSubSlots from TimeSlots...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    const result = await TimeSlot.updateMany(
      {},
      { 
        $unset: { 
          requiresSubSlots: "",
          subSlots: ""
        } 
      }
    );
    
    console.log(`✓ Rolled back ${result.modifiedCount} TimeSlot documents`);
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
