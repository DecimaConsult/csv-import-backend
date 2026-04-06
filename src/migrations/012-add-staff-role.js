/**
 * Migration: Add STAFF role support
 * 
 * This migration documents the addition of the STAFF role to the system.
 * No database changes are required as the role is added to the User model enum.
 * 
 * STAFF role has same access as ADMIN except:
 * - Cannot manage Guides
 * - Cannot manage Coordinators
 * - Cannot access Import functionality
 * - Cannot disable/enable accounts
 */

export const up = async () => {
  console.log('✅ STAFF role added to User model enum');
  console.log('   No database migration needed - schema change only');
  return true;
};

export const down = async () => {
  console.log('⚠️  STAFF role removal would require manual data cleanup');
  console.log('   This migration is documentation only');
  return true;
};

export default { up, down };
