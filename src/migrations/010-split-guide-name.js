import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Migration 010: Split guideName into firstName and lastName
 * 
 * This migration:
 * 1. Splits existing guideName field into firstName and lastName
 * 2. Handles single names by putting them in firstName
 * 3. Keeps guideName for backward compatibility
 */

async function up() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Guide = mongoose.model('Guide', new mongoose.Schema({}, { strict: false }));
    
    // Get all guides
    const guides = await Guide.find({});
    console.log(`📊 Found ${guides.length} guides to update\n`);

    let updated = 0;
    let skipped = 0;

    for (const guide of guides) {
      // Skip if already has firstName and lastName
      if (guide.firstName && guide.lastName) {
        skipped++;
        continue;
      }

      // Split guideName
      const nameParts = guide.guideName.trim().split(/\s+/);
      
      let firstName, lastName;
      if (nameParts.length === 1) {
        // Single name - put in firstName
        firstName = nameParts[0];
        lastName = '';
      } else {
        // Multiple parts - first is firstName, rest is lastName
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }

      // Update the guide
      await Guide.updateOne(
        { _id: guide._id },
        { 
          $set: { 
            firstName,
            lastName
          } 
        }
      );

      console.log(`✅ Updated: ${guide.guideName} → firstName: "${firstName}", lastName: "${lastName}"`);
      updated++;
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${guides.length}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

async function down() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Guide = mongoose.model('Guide', new mongoose.Schema({}, { strict: false }));
    
    // Remove firstName and lastName fields
    await Guide.updateMany(
      {},
      { 
        $unset: { 
          firstName: '',
          lastName: ''
        } 
      }
    );

    console.log('✅ Rollback complete - removed firstName and lastName fields');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  }
}

// Run migration
const command = process.argv[2];
if (command === 'down') {
  down();
} else {
  up();
}
