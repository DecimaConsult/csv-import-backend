import mongoose from 'mongoose';
import Guide from '../models/Guide.js';

export const up = async () => {
  console.log('Adding calendarEmail field to guides...');
  
  // Add calendarEmail field to all existing guides (defaults to null)
  const result = await Guide.updateMany(
    { calendarEmail: { $exists: false } },
    {
      $set: {
        calendarEmail: null
      }
    }
  );
  
  console.log(`✅ calendarEmail field added to ${result.modifiedCount} guides`);
};

export const down = async () => {
  console.log('Removing calendarEmail field from guides...');
  
  // Remove calendarEmail field
  const result = await Guide.updateMany(
    {},
    {
      $unset: {
        calendarEmail: ''
      }
    }
  );
  
  console.log(`✅ calendarEmail field removed from ${result.modifiedCount} guides`);
};
