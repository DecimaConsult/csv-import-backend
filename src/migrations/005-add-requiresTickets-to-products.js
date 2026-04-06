import mongoose from 'mongoose';
import Product from '../models/Product.js';

/**
 * Migration: Add requiresTickets field to products
 * 
 * This migration adds the requiresTickets boolean field to all existing products,
 * defaulting to false to maintain backward compatibility.
 */

export const up = async () => {
  console.log('Running migration: Add requiresTickets to products...');
  
  try {
    // Update all products that don't have the requiresTickets field
    const result = await Product.updateMany(
      { requiresTickets: { $exists: false } },
      { $set: { requiresTickets: false } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} products with requiresTickets field`);
    
    return {
      success: true,
      message: `Added requiresTickets field to ${result.modifiedCount} products`
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

export const down = async () => {
  console.log('Rolling back migration: Remove requiresTickets from products...');
  
  try {
    // Remove the requiresTickets field from all products
    const result = await Product.updateMany(
      {},
      { $unset: { requiresTickets: '' } }
    );
    
    console.log(`✅ Removed requiresTickets field from ${result.modifiedCount} products`);
    
    return {
      success: true,
      message: `Removed requiresTickets field from ${result.modifiedCount} products`
    };
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};

export default { up, down };
