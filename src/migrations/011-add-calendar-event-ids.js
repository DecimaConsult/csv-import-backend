import mongoose from 'mongoose';
import TimeSlot from '../models/TimeSlot.js';

export const up = async () => {
  console.log('Adding calendarEventId field to TimeSlots...');
  
  // Add calendarEventId field to all existing time slots
  const result = await TimeSlot.updateMany(
    { calendarEventId: { $exists: false } },
    {
      $set: {
        calendarEventId: null
      }
    }
  );
  
  // Update subSlots to have calendarEventId
  await TimeSlot.updateMany(
    { 'subSlots.0': { $exists: true } },
    {
      $set: {
        'subSlots.$[].calendarEventId': null
      }
    }
  );
  
  console.log(`✅ calendarEventId field added to ${result.modifiedCount} TimeSlots and SubSlots`);
};

export const down = async () => {
  console.log('Removing calendarEventId field from TimeSlots...');
  
  // Remove calendarEventId field
  const result = await TimeSlot.updateMany(
    {},
    {
      $unset: {
        calendarEventId: '',
        'subSlots.$[].calendarEventId': ''
      }
    }
  );
  
  console.log(`✅ calendarEventId field removed from ${result.modifiedCount} TimeSlots and SubSlots`);
};
