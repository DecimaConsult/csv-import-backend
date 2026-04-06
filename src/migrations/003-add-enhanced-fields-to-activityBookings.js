/**
 * Migration: Add enhanced fields to ActivityBooking schema
 * 
 * This migration adds the following fields to existing ActivityBooking documents:
 * - totalYouth: Number (youth passenger category)
 * - passengers[].checkInStatus: Object (check-in tracking)
 * - bookingSource: String (booking channel tracking)
 * - selectedOptions: Array (customer-selected extras)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ActivityBooking from '../models/ActivityBooking.js';

// Load environment variables
dotenv.config({ path: './backend/.env' });

async function up() {
  console.log('Starting migration: Add enhanced fields to ActivityBookings...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    let updatedCount = 0;
    
    // Process bookings in batches to avoid memory issues
    const batchSize = 100;
    let skip = 0;
    let hasMore = true;
    
    while (hasMore) {
      const bookings = await ActivityBooking.find({})
        .skip(skip)
        .limit(batchSize)
        .lean();
      
      if (bookings.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const booking of bookings) {
        const updates = {};
        
        // Add totalYouth if missing
        if (booking.totalYouth === undefined) {
          updates.totalYouth = 0;
        }
        
        // Add bookingSource if missing
        if (!booking.bookingSource) {
          updates.bookingSource = 'UNKNOWN';
        }
        
        // Add selectedOptions if missing
        if (!booking.selectedOptions) {
          updates.selectedOptions = [];
        }
        
        // Add checkInStatus to passengers if missing
        if (booking.passengers && booking.passengers.length > 0) {
          const updatedPassengers = booking.passengers.map(passenger => {
            if (!passenger.checkInStatus) {
              return {
                ...passenger,
                checkInStatus: {
                  isCheckedIn: false,
                  checkedInAt: null,
                  checkedInBy: null,
                  checkedInByName: null
                }
              };
            }
            return passenger;
          });
          updates.passengers = updatedPassengers;
        }
        
        // Apply updates if any
        if (Object.keys(updates).length > 0) {
          await ActivityBooking.updateOne(
            { _id: booking._id },
            { $set: updates }
          );
          updatedCount++;
        }
      }
      
      skip += batchSize;
      console.log(`  Processed ${skip} bookings...`);
    }
    
    console.log(`✓ Updated ${updatedCount} ActivityBooking documents`);
    console.log(`  - Added totalYouth field (default: 0)`);
    console.log(`  - Added bookingSource field (default: 'UNKNOWN')`);
    console.log(`  - Added selectedOptions field (default: [])`);
    console.log(`  - Added checkInStatus to passengers`);
    
    // Verify the migration
    const totalBookings = await ActivityBooking.countDocuments();
    const bookingsWithYouth = await ActivityBooking.countDocuments({ totalYouth: { $exists: true } });
    const bookingsWithSource = await ActivityBooking.countDocuments({ bookingSource: { $exists: true } });
    const bookingsWithOptions = await ActivityBooking.countDocuments({ selectedOptions: { $exists: true } });
    
    console.log(`\nVerification:`);
    console.log(`  - Total ActivityBookings: ${totalBookings}`);
    console.log(`  - Bookings with totalYouth: ${bookingsWithYouth}`);
    console.log(`  - Bookings with bookingSource: ${bookingsWithSource}`);
    console.log(`  - Bookings with selectedOptions: ${bookingsWithOptions}`);
    
    if (totalBookings === bookingsWithYouth && 
        totalBookings === bookingsWithSource && 
        totalBookings === bookingsWithOptions) {
      console.log('✓ Migration completed successfully!');
      return true;
    } else {
      console.error('✗ Migration incomplete - some documents missing fields');
      return false;
    }
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    throw error;
  }
}

async function down() {
  console.log('Starting rollback: Remove enhanced fields from ActivityBookings...');
  
  try {
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in environment variables');
      }
      await mongoose.connect(mongoUri);
    }
    // Remove the new fields
    const result = await ActivityBooking.updateMany(
      {},
      { 
        $unset: { 
          totalYouth: "",
          bookingSource: "",
          selectedOptions: ""
        }
      }
    );
    
    console.log(`✓ Removed enhanced fields from ${result.modifiedCount} documents`);
    
    // Remove checkInStatus from passengers (more complex)
    let updatedCount = 0;
    const batchSize = 100;
    let skip = 0;
    let hasMore = true;
    
    while (hasMore) {
      const bookings = await ActivityBooking.find({})
        .skip(skip)
        .limit(batchSize)
        .lean();
      
      if (bookings.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const booking of bookings) {
        if (booking.passengers && booking.passengers.length > 0) {
          const updatedPassengers = booking.passengers.map(passenger => {
            const { checkInStatus, ...rest } = passenger;
            return rest;
          });
          
          await ActivityBooking.updateOne(
            { _id: booking._id },
            { $set: { passengers: updatedPassengers } }
          );
          updatedCount++;
        }
      }
      
      skip += batchSize;
    }
    
    console.log(`✓ Removed checkInStatus from passengers in ${updatedCount} documents`);
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
