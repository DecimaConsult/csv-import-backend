export const up = async (db) => {
  console.log('Adding guide tiers and product specializations...');
  
  // Add tier and productSpecializations fields to all existing guides
  await db.collection('guides').updateMany(
    {},
    {
      $set: {
        tier: 'STANDARD',
        productSpecializations: []
      }
    }
  );
  
  // Create indexes
  await db.collection('guides').createIndex({ tier: 1, guideName: 1 });
  await db.collection('guides').createIndex({ productSpecializations: 1 });
  
  console.log('✅ Guide tiers and product specializations added');
};

export const down = async (db) => {
  console.log('Removing guide tiers and product specializations...');
  
  // Remove fields
  await db.collection('guides').updateMany(
    {},
    {
      $unset: {
        tier: '',
        productSpecializations: ''
      }
    }
  );
  
  // Drop indexes
  try {
    await db.collection('guides').dropIndex('tier_1_guideName_1');
    await db.collection('guides').dropIndex('productSpecializations_1');
  } catch (error) {
    console.log('Note: Some indexes may not exist');
  }
  
  console.log('✅ Guide tiers and product specializations removed');
};
