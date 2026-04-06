import mongoose from 'mongoose';

export const up = async () => {
  console.log('Creating CalendarInvitations collection...');
  
  const db = mongoose.connection.db;
  
  // Check if collection already exists
  const collections = await db.listCollections({ name: 'calendarinvitations' }).toArray();
  
  if (collections.length === 0) {
    // Create the collection
    await db.createCollection('calendarinvitations');
    console.log('✅ CalendarInvitations collection created');
  } else {
    console.log('ℹ️  CalendarInvitations collection already exists');
  }
  
  // Create indexes
  const collection = db.collection('calendarinvitations');
  await collection.createIndex({ slotId: 1 });
  await collection.createIndex({ guideId: 1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ slotId: 1, guideId: 1 });
  await collection.createIndex({ status: 1, expiresAt: 1 });
  
  console.log('✅ CalendarInvitations indexes created');
};

export const down = async () => {
  console.log('Dropping CalendarInvitations collection...');
  
  const db = mongoose.connection.db;
  
  // Drop the collection
  await db.collection('calendarinvitations').drop();
  
  console.log('✅ CalendarInvitations collection dropped');
};
