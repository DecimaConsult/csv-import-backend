/**
 * Migration Runner
 * 
 * Executes all database migrations in order.
 * Usage:
 *   node src/migrations/run-migrations.js up    # Run all migrations
 *   node src/migrations/run-migrations.js down  # Rollback all migrations
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load from backend/.env (when run from project root) or .env (when run from backend dir)
dotenv.config({ path: join(__dirname, '../../../.env') }) || dotenv.config({ path: join(__dirname, '../../.env') });

// Import all migrations
import * as migration001 from './001-add-requiresSubSlots-to-timeSlots.js';
import * as migration002 from './002-add-subSlotId-to-activityBookings.js';
import * as migration003 from './003-add-enhanced-fields-to-activityBookings.js';
import * as migration004 from './004-create-products-collection.js';
import * as migration005 from './005-add-requiresTickets-to-products.js';
import * as migration010 from './010-add-calendar-email-to-guides.js';
import * as migration011 from './011-add-calendar-event-ids.js';
import * as migration012 from './012-create-calendar-invitations.js';
import * as migration013 from './013-add-product-duration.js';

const migrations = [
  { name: '001-add-requiresSubSlots-to-timeSlots', module: migration001 },
  { name: '002-add-subSlotId-to-activityBookings', module: migration002 },
  { name: '003-add-enhanced-fields-to-activityBookings', module: migration003 },
  { name: '004-create-products-collection', module: migration004 },
  { name: '005-add-requiresTickets-to-products', module: migration005 },
  { name: '010-add-calendar-email-to-guides', module: migration010 },
  { name: '011-add-calendar-event-ids', module: migration011 },
  { name: '012-create-calendar-invitations', module: migration012 },
  { name: '013-add-product-duration', module: migration013 }
];

async function runMigrations(direction = 'up') {
  console.log('='.repeat(60));
  console.log(`DATABASE MIGRATION RUNNER - ${direction.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log('');
  
  // Connect to database
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not found in environment variables');
  }
  
  await mongoose.connect(mongoUri);
  console.log(`✓ Connected to database: ${mongoose.connection.name}\n`);
  
  const migrationsToRun = direction === 'up' ? migrations : [...migrations].reverse();
  let successCount = 0;
  let failCount = 0;
  
  for (const migration of migrationsToRun) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Running: ${migration.name}`);
    console.log('─'.repeat(60));
    
    try {
      const result = await migration.module[direction]();
      if (result !== false) {
        successCount++;
        console.log(`✓ ${migration.name} completed successfully\n`);
      } else {
        failCount++;
        console.error(`✗ ${migration.name} failed\n`);
      }
    } catch (error) {
      failCount++;
      console.error(`✗ ${migration.name} failed with error:`, error.message);
      console.error('Stack trace:', error.stack);
      
      // Ask if we should continue
      if (migrationsToRun.indexOf(migration) < migrationsToRun.length - 1) {
        console.log('\n⚠ Migration failed. Stopping execution to prevent data inconsistency.');
        break;
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total migrations: ${migrationsToRun.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  
  if (failCount === 0) {
    console.log('\n✓ All migrations completed successfully!');
  } else {
    console.log('\n✗ Some migrations failed. Please review the errors above.');
  }
  
  return failCount === 0;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'up';
  
  if (!['up', 'down'].includes(command)) {
    console.error('Invalid command. Use "up" or "down"');
    process.exit(1);
  }
  
  try {
    const success = await runMigrations(command);
    await mongoose.connection.close();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Migration runner error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

export { runMigrations };
