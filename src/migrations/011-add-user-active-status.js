export const up = async (db) => {
  console.log('Adding isActive field to users...');
  
  // Add isActive and related fields to all existing users
  await db.collection('users').updateMany(
    {},
    {
      $set: {
        isActive: true,
        disabledAt: null,
        disabledBy: null,
        disableReason: null
      }
    }
  );
  
  // Create index on isActive field
  await db.collection('users').createIndex({ isActive: 1 });
  
  console.log('✅ User active status fields added');
};

export const down = async (db) => {
  console.log('Removing isActive field from users...');
  
  // Remove fields
  await db.collection('users').updateMany(
    {},
    {
      $unset: {
        isActive: '',
        disabledAt: '',
        disabledBy: '',
        disableReason: ''
      }
    }
  );
  
  // Drop index
  await db.collection('users').dropIndex('isActive_1');
  
  console.log('✅ User active status fields removed');
};
