/**
 * Migration: Add durationMinutes field to all products
 * 
 * This migration adds the durationMinutes field to all existing products
 * with a default value of 120 minutes (2 hours).
 * 
 * Products created from webhooks going forward will get actual duration
 * from the webhook payload.
 */

import mongoose from 'mongoose';
import Product from '../models/Product.js';

export async function up() {
  console.log('Running migration: 013-add-product-duration');
  
  try {
    // Update all products that don't have durationMinutes set
    const result = await Product.updateMany(
      { durationMinutes: { $exists: false } },
      { $set: { durationMinutes: 120 } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} products with default duration of 120 minutes`);
    
    // Also update any products with null or undefined durationMinutes
    const nullResult = await Product.updateMany(
      { $or: [{ durationMinutes: null }, { durationMinutes: { $type: 'null' } }] },
      { $set: { durationMinutes: 120 } }
    );
    
    if (nullResult.modifiedCount > 0) {
      console.log(`✅ Updated ${nullResult.modifiedCount} products with null duration`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error in migration 013-add-product-duration:', error);
    throw error;
  }
}

export async function down() {
  console.log('Rolling back migration: 013-add-product-duration');
  
  try {
    // Remove durationMinutes field from all products
    const result = await Product.updateMany(
      {},
      { $unset: { durationMinutes: '' } }
    );
    
    console.log(`✅ Removed durationMinutes from ${result.modifiedCount} products`);
    return true;
  } catch (error) {
    console.error('❌ Error rolling back migration 013-add-product-duration:', error);
    throw error;
  }
}

export default { up, down };
