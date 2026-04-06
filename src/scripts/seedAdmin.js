/**
 * Seed Script: Create Default Super Admin User
 * 
 * This script creates a default admin user for initial system access.
 * Run this once after setting up the database.
 * 
 * Usage: node src/scripts/seedAdmin.js
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

const DEFAULT_ADMIN = {
  email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@unclesam.tours',
  password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
  name: process.env.DEFAULT_ADMIN_NAME || 'Super Admin',
  role: 'ADMIN'
};

async function seedAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: DEFAULT_ADMIN.email });
    
    if (existingAdmin) {
      console.log('\n⚠️  Admin user already exists!');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Name: ${existingAdmin.name}`);
      console.log(`Role: ${existingAdmin.role}`);
      console.log('\nIf you need to reset the password, delete this user first.');
      await mongoose.connection.close();
      return;
    }

    // Hash password
    console.log('\nCreating admin user...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, salt);

    // Create admin user
    const admin = new User({
      email: DEFAULT_ADMIN.email,
      password: hashedPassword,
      name: DEFAULT_ADMIN.name,
      role: DEFAULT_ADMIN.role
    });

    await admin.save();

    console.log('\n✅ Super Admin user created successfully!');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ', DEFAULT_ADMIN.email);
    console.log('🔑 Password: ', DEFAULT_ADMIN.password);
    console.log('👤 Name:     ', DEFAULT_ADMIN.name);
    console.log('🛡️  Role:     ', DEFAULT_ADMIN.role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    console.log('\nYou can now login to the dashboard with these credentials.\n');

    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error seeding admin user:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedAdmin();
