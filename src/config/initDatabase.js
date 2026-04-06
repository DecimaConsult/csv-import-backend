/**
 * Database Initialization
 * Automatically creates default admin user if none exists
 */

import bcrypt from 'bcryptjs';
import User from '../models/User.js';

/**
 * Initialize database with default data
 * Creates super admin user if no admin exists
 */
export async function initDatabase() {
  try {
    console.log('[DB Init] Checking for admin users...');
    
    // Check if any admin user exists
    const adminCount = await User.countDocuments({ role: 'ADMIN' });
    
    if (adminCount === 0) {
      console.log('[DB Init] No admin users found. Creating default admin...');
      
      const defaultAdmin = {
        email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@unclesam.tours',
        password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
        name: process.env.DEFAULT_ADMIN_NAME || 'Super Admin',
        role: 'ADMIN'
      };
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultAdmin.password, salt);
      
      // Create admin user
      const admin = new User({
        email: defaultAdmin.email,
        password: hashedPassword,
        name: defaultAdmin.name,
        role: defaultAdmin.role
      });
      
      await admin.save();
      
      console.log('[DB Init] ✅ Default admin user created successfully!');
      console.log('[DB Init] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`[DB Init] 📧 Email:    ${defaultAdmin.email}`);
      console.log(`[DB Init] 🔑 Password: ${defaultAdmin.password}`);
      console.log('[DB Init] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[DB Init] ⚠️  IMPORTANT: Change this password after first login!');
    } else {
      console.log(`[DB Init] ✓ Found ${adminCount} admin user(s). Skipping admin creation.`);
    }
    
  } catch (error) {
    console.error('[DB Init] Error initializing database:', error.message);
    // Don't throw - allow app to continue even if init fails
  }
}

export default initDatabase;
