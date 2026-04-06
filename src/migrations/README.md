# Database Migrations

This directory contains database migration scripts for the Enhanced Dashboard System.

## Quick Start

### Run All Migrations

```bash
node src/migrations/run-migrations.js up
```

### Rollback All Migrations

```bash
node src/migrations/run-migrations.js down
```

### Run Individual Migration

```bash
node src/migrations/001-add-requiresSubSlots-to-timeSlots.js up
```

### Check Migration Status

```bash
node test-migration-status.js
```

## Available Migrations

| # | Migration | Description |
|---|-----------|-------------|
| 001 | add-requiresSubSlots-to-timeSlots | Adds `requiresSubSlots` field to TimeSlot documents |
| 002 | add-subSlotId-to-activityBookings | Adds `subSlotId` field to ActivityBooking documents |
| 003 | add-enhanced-fields-to-activityBookings | Adds `totalYouth`, `bookingSource`, `selectedOptions`, and passenger `checkInStatus` |
| 004 | create-products-collection | Creates Products collection with initial tour products |

## Migration Files

Each migration file contains:
- `up()` function: Applies the migration
- `down()` function: Rolls back the migration
- CLI execution support: Can be run directly with `node <migration-file>.js up|down`
- Verification logic: Confirms migration was applied correctly

## Safety Features

- **Idempotent**: Safe to run multiple times
- **Reversible**: All migrations can be rolled back
- **Verification**: Each migration verifies its changes
- **Error Handling**: Stops on first error to prevent data corruption
- **Backward Compatible**: Existing functionality continues to work

## Documentation

For detailed documentation, see: `backend/MIGRATION-GUIDE.md`

## Testing

Test migrations on development environment before running on production:

```bash
# Check current status
node test-migration-status.js

# Run migrations
node src/migrations/run-migrations.js up

# Verify
node test-migration-status.js

# Test rollback (development only!)
node test-migration-rollback.js
```

## Adding New Migrations

1. Create new migration file: `00X-your-migration-name.js`
2. Implement `up()` and `down()` functions
3. Add to `run-migrations.js` imports and migrations array
4. Test on development database
5. Document in this README

See `MIGRATION-GUIDE.md` for detailed instructions.
