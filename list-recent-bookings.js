import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

async function listRecentBookings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const ActivityBooking = mongoose.model('ActivityBooking', new mongoose.Schema({}, { strict: false }));
    
    const bookings = await ActivityBooking.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('bookingId productTitle startTime status')
      .lean();

    console.log('📋 Recent Booking IDs in your database:\n');
    bookings.forEach((booking, index) => {
      console.log(`${index + 1}. Booking ID: ${booking.bookingId}`);
      console.log(`   Product: ${booking.productTitle}`);
      console.log(`   Start: ${booking.startTime}`);
      console.log(`   Status: ${booking.status}\n`);
    });

    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

listRecentBookings()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
