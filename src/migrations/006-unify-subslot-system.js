/**
 * Migration 006: Unify Sub-Slot System
 * 
 * Goal: Always use subSlots array with Sub-Slot A as default
 * 
 * Changes:
 * 1. Convert existing root-level TimeSlot data to Sub-Slot A
 * 2. Add subSlotId = "A" to all ActivityBookings without it
 * 3. Preserve existing data for rollback capability
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATION_NAME = '006-unify-subslot-system';
const MONGODB_URI = process.env.MONGODB_URI;

async function up(db) {
  console.log(`\n🔄 Running migration: ${MIGRATION_NAME} (UP)`);
  
  const timeSlots = db.collection('timeslots');
  const activityBookings = db.collection('activitybookings');
  
  let slotsUpdated = 0;
  let bookingsUpdated = 0;
  
  // Step 1: Convert TimeSlots to use subSlots array
  console.log('\n📦 Step 1: Converting TimeSlots to unified subSlot structure...');
  
  const slotsWithoutSubSlots = await timeSlots.find({
    $or: [
      { subSlots: { $exists: false } },
      { subSlots: { $size: 0 } }
    ]
  }).toArray();
  
  console.log(`Found ${slotsWithoutSubSlots.length} slots to migrate`);
  
  for (const slot of slotsWithoutSubSlots) {
    // Create Sub-Slot A from root-level data
    const subSlotA = {
      subSlotId: 'A',
      subSlotNumber: 1,
      maxCapacity: slot.maxCapacity || 25,
      currentPassengerCount: slot.currentPassengerCount || 0,
      assignedGuideId: slot.assignedGuideId || null,
      assignedGuideName: slot.assignedGuideName || null,
      status: slot.status || 'UNASSIGNED',
      bookingIds: slot.bookingIds || [],
      ticketCostCalculation: slot.ticketCostCalculation || null,
      receiptId: slot.receiptId || null,
      ticketFile: slot.ticketFile || null
    };
    
    // Update the slot with subSlots array
    await timeSlots.updateOne(
      { _id: slot._id },
      {
        $set: {
          subSlots: [subSlotA],
          // Mark root-level fields as deprecated but keep them for rollback
          _migrated: true,
          _migrationDate: new Date(),
          _migrationVersion: MIGRATION_NAME
        }
      }
    );
    
    slotsUpdated++;
    
    if (slotsUpdated % 10 === 0) {
      console.log(`  Migrated ${slotsUpdated}/${slotsWithoutSubSlots.length} slots...`);
    }
  }
  
  console.log(`✅ Migrated ${slotsUpdated} TimeSlots to unified structure`);
  
  // Step 2: Add subSlotId to ActivityBookings
  console.log('\n📦 Step 2: Adding subSlotId to ActivityBookings...');
  
  const bookingsWithoutSubSlotId = await activityBookings.find({
    subSlotId: { $exists: false }
  }).toArray();
  
  console.log(`Found ${bookingsWithoutSubSlotId.length} bookings to update`);
  
  for (const booking of bookingsWithoutSubSlotId) {
    await activityBookings.updateOne(
      { _id: booking._id },
      {
        $set: {
          subSlotId: 'A',
          _migrated: true,
          _migrationDate: new Date(),
          _migrationVersion: MIGRATION_NAME
        }
      }
    );
    
    bookingsUpdated++;
    
    if (bookingsUpdated % 50 === 0) {
      console.log(`  Updated ${bookingsUpdated}/${bookingsWithoutSubSlotId.length} bookings...`);
    }
  }
  
  console.log(`✅ Updated ${bookingsUpdated} ActivityBookings with subSlotId`);
  
  // Step 3: Verify migration
  console.log('\n🔍 Step 3: Verifying migration...');
  
  const slotsWithoutSubSlotsAfter = await timeSlots.countDocuments({
    $or: [
      { subSlots: { $exists: false } },
      { subSlots: { $size: 0 } }
    ]
  });
  
  const bookingsWithoutSubSlotIdAfter = await activityBookings.countDocuments({
    subSlotId: { $exists: false }
  });
  
  console.log(`  TimeSlots without subSlots: ${slotsWithoutSubSlotsAfter}`);
  console.log(`  ActivityBookings without subSlotId: ${bookingsWithoutSubSlotIdAfter}`);
  
  if (slotsWithoutSubSlotsAfter === 0 && bookingsWithoutSubSlotIdAfter === 0) {
    console.log('✅ Migration verification passed!');
  } else {
    console.log('⚠️  Warning: Some documents may not have been migrated');
  }
  
  return {
    slotsUpdated,
    bookingsUpdated,
    success: true
  };
}

async function down(db) {
  console.log(`\n🔄 Running migration: ${MIGRATION_NAME} (DOWN)`);
  
  const timeSlots = db.collection('timeslots');
  const activityBookings = db.collection('activitybookings');
  
  let slotsReverted = 0;
  let bookingsReverted = 0;
  
  // Step 1: Revert TimeSlots (remove subSlots, keep root-level data)
  console.log('\n📦 Step 1: Reverting TimeSlots...');
  
  const migratedSlots = await timeSlots.find({
    _migrationVersion: MIGRATION_NAME
  }).toArray();
  
  console.log(`Found ${migratedSlots.length} slots to revert`);
  
  for (const slot of migratedSlots) {
    await timeSlots.updateOne(
      { _id: slot._id },
      {
        $unset: {
          subSlots: '',
          _migrated: '',
          _migrationDate: '',
          _migrationVersion: ''
        }
      }
    );
    
    slotsReverted++;
  }
  
  console.log(`✅ Reverted ${slotsReverted} TimeSlots`);
  
  // Step 2: Remove subSlotId from ActivityBookings
  console.log('\n📦 Step 2: Removing subSlotId from ActivityBookings...');
  
  const migratedBookings = await activityBookings.find({
    _migrationVersion: MIGRATION_NAME
  }).toArray();
  
  console.log(`Found ${migratedBookings.length} bookings to revert`);
  
  for (const booking of migratedBookings) {
    await activityBookings.updateOne(
      { _id: booking._id },
      {
        $unset: {
          subSlotId: '',
          _migrated: '',
          _migrationDate: '',
          _migrationVersion: ''
        }
      }
    );
    
    bookingsReverted++;
  }
  
  console.log(`✅ Reverted ${bookingsReverted} ActivityBookings`);
  
  return {
    slotsReverted,
    bookingsReverted,
    success: true
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const direction = process.argv[2] || 'up';
    
    if (direction === 'up') {
      const result = await up(db);
      console.log('\n✅ Migration completed successfully!');
      console.log(result);
    } else if (direction === 'down') {
      const result = await down(db);
      console.log('\n✅ Rollback completed successfully!');
      console.log(result);
    } else {
      console.error('Invalid direction. Use "up" or "down"');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

export { up, down };
