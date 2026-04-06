/**
 * Migration: Add COORDINATOR role support
 * 
 * This migration adds support for the COORDINATOR role in the system.
 * No data migration is needed - coordinators will be created manually by admins.
 */

import mongoose from 'mongoose';
import User from '../models/User.js';

export const up = async () => {
  console.log('🔄 Adding COORDINATOR role support...');
  
  // No data migration needed - just schema update
  // The User model enum has been updated to include COORDINATOR
  // New coordinators will be created manually by admins via the API
  
  console.log('✅ COORDINATOR role support added');
  console.log('ℹ️  Coordinators can now be created via POST /api/coordinators');
};

export const down = async () => {
  console.log('🔄 Removing COORDINATOR role...');
  
  // Remove any coordinator users
  const result = await User.deleteMany({ role: 'COORDINATOR' });
  console.log(`🗑️  Removed ${result.deletedCount} coordinator user(s)`);
  
  console.log('✅ COORDINATOR role removed');
};

export default { up, down };
