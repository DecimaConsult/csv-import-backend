import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

function generateSignature(method, path, date, secretKey) {
  const accessKey = process.env.BOKUN_ACCESS_KEY;
  const signatureBase = date + accessKey + method + path;
  const hmac = crypto.createHmac('sha1', secretKey);
  hmac.update(signatureBase);
  return hmac.digest('base64');
}

function getBokunDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function fetchBooking(bookingId) {
  try {

    console.log(`\n🔍 Fetching booking ${bookingId} from Bokun API...\n`);

    const accessKey = process.env.BOKUN_ACCESS_KEY;
    const secretKey = process.env.BOKUN_SECRET_KEY;

    if (!accessKey || !secretKey) {
      throw new Error('BOKUN_ACCESS_KEY or BOKUN_SECRET_KEY not found in .env file');
    }

    const path = `/booking.json/booking/${bookingId}`;
    const date = getBokunDate();
    const signature = generateSignature('GET', path, date, secretKey);

    const response = await axios.get(
      `https://api.bokun.io${path}`,
      {
        headers: {
          'X-Bokun-Date': date,
          'X-Bokun-AccessKey': accessKey,
          'X-Bokun-Signature': signature,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Successfully fetched booking data\n');
    console.log('📦 Full JSON Response:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(response.data, null, 2));
    console.log('='.repeat(80));

    // Save to file
    const fs = await import('fs');
    const filename = `booking-${bookingId}.json`;
    fs.writeFileSync(filename, JSON.stringify(response.data, null, 2));
    console.log(`\n💾 Saved to ${filename}`);

    return response.data;

  } catch (error) {
    console.error('❌ Error fetching booking:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    
    throw error;
  }
}

// Get booking ID from command line argument or use default
const bookingId = process.argv[2];

fetchBooking(bookingId)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
