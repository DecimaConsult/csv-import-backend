import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Product from './src/models/Product.js';
import ActivityBooking from './src/models/ActivityBooking.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend/.env
dotenv.config({ path: join(__dirname, '.env') });

async function listProducts() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in .env');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all products
    const products = await Product.find().sort({ productId: 1 });

    console.log(`Found ${products.length} products:\n`);
    console.log('='.repeat(100));

    let updatedCount = 0;

    for (const product of products) {
      console.log(`\nProduct ID: ${product.productId}`);
      console.log(`Name: ${product.name}`);
      console.log(`Nickname: ${product.nickname || '(not set)'}`);
      console.log(`Requires Sub-Slots: ${product.requiresSubSlots}`);
      console.log(`Sub-Slot Capacity: ${product.subSlotCapacity || 'N/A'}`);
      console.log(`Requires Tickets: ${product.requiresTickets}`);
      console.log(`Active: ${product.active}`);
      
      // Find a sample booking to show actual product title from bookings
      const sampleBooking = await ActivityBooking.findOne({ 
        productId: product.productId 
      }).select('productTitle bookingId');
      
      if (sampleBooking) {
        console.log(`\n  📋 Sample Booking:`);
        console.log(`     Booking ID: ${sampleBooking.bookingId}`);
        console.log(`     Product Title from Booking: ${sampleBooking.productTitle}`);
        
        // Check if product name is missing, undefined, or is the default "Unnamed Product"
        const needsUpdate = !product.name || product.name === 'Unnamed Product';
        
        if (needsUpdate && sampleBooking.productTitle) {
          console.log(`     ⚠️  MISMATCH: Product has "${product.name || 'undefined'}" but booking shows "${sampleBooking.productTitle}"`);
          console.log(`     🔧 FIXING: Updating product name...`);
          
          // Update the product name
          product.name = sampleBooking.productTitle;
          await product.save();
          updatedCount++;
          
          console.log(`     ✅ UPDATED: Product name is now "${product.name}"`);
        }
      } else {
        console.log(`\n  ⚠️  No bookings found for this product`);
      }
      
      console.log('-'.repeat(100));
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`Total Products: ${products.length}`);
    console.log(`Products Updated: ${updatedCount}`);
    
    const unnamedProducts = products.filter(p => !p.name || p.name === 'Unnamed Product');
    if (unnamedProducts.length > 0) {
      console.log(`\n⚠️  Products still with missing or "Unnamed Product" name: ${unnamedProducts.length}`);
      console.log(`Product IDs: ${unnamedProducts.map(p => p.productId).join(', ')}`);
      console.log(`(These products have no bookings to get the name from)`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listProducts();
