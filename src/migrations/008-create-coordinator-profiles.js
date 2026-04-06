/**
 * Migration: Create Coordinator profiles collection
 * 
 * This migration creates the coordinators collection to store product assignments
 */

import mongoose from 'mongoose';
import Coordinator from '../models/Coordinator.js';
import User from '../models/User.js';

export const up = async () => {
  console.log('🔄 Creating Coordinator profiles for existing coordinator users...');
  
  // Find all users with COORDINATOR role
  const coordinatorUsers = await User.find({ role: 'COORDINATOR' });
  
  if (coordinatorUsers.length === 0) {
    console.log('ℹ️  No coordinator users found');
    return;
  }
  
  // Create coordinator profiles for existing users
  for (const user of coordinatorUsers) {
    const existingCoordinator = await Coordinator.findOne({ userId: user._id });
    
    if (!existingCoordinator) {
      await Coordinator.create({
        userId: user._id,
        name: user.name,
        email: user.email,
        assignedProducts: [] // Empty by default, admin will assign
      });
      console.log(`✅ Created coordinator profile for ${user.email}`);
    } else {
      console.log(`ℹ️  Coordinator profile already exists for ${user.email}`);
    }
  }
  
  console.log('✅ Coordinator profiles migration complete');
};

export const down = async () => {
  console.log('🔄 Removing all coordinator profiles...');
  
  const result = await Coordinator.deleteMany({});
  console.log(`🗑️  Removed ${result.deletedCount} coordinator profile(s)`);
  
  console.log('✅ Coordinator profiles removed');
};

export default { up, down };
