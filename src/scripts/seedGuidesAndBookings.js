/**
 * Seed Script: Create Guide Profiles and Dummy Bookings
 * 
 * This script creates:
 * 1. 3 guide user accounts with associated Guide profiles
 * 2. 35 dummy activity bookings for testing
 * 
 * Usage: node src/scripts/seedGuidesAndBookings.js
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Guide from '../models/Guide.js';
import ActivityBooking from '../models/ActivityBooking.js';
import TimeSlot from '../models/TimeSlot.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

// Guide profiles to create
const GUIDE_PROFILES = [
  {
    email: 'marie.dubois@unclesam.tours',
    password: 'Guide@123',
    name: 'Marie Dubois',
    guideName: 'Marie Dubois',
    phoneNumber: '+33 6 12 34 56 78',
    availability: [
      {
        date: new Date('2025-11-01'),
        startTime: '09:00',
        endTime: '18:00',
        status: 'Available'
      },
      {
        date: new Date('2025-11-02'),
        startTime: '09:00',
        endTime: '18:00',
        status: 'Available'
      },
      {
        date: new Date('2025-11-03'),
        startTime: '09:00',
        endTime: '18:00',
        status: 'Available'
      }
    ]
  },
  {
    email: 'jean.martin@unclesam.tours',
    password: 'Guide@123',
    name: 'Jean Martin',
    guideName: 'Jean Martin',
    phoneNumber: '+33 6 23 45 67 89',
    availability: [
      {
        date: new Date('2025-11-01'),
        startTime: '10:00',
        endTime: '19:00',
        status: 'Available'
      },
      {
        date: new Date('2025-11-02'),
        startTime: '10:00',
        endTime: '19:00',
        status: 'Available'
      },
      {
        date: new Date('2025-11-04'),
        startTime: '10:00',
        endTime: '19:00',
        status: 'OnLeave'
      }
    ]
  },
  {
    email: 'sophie.laurent@unclesam.tours',
    password: 'Guide@123',
    name: 'Sophie Laurent',
    guideName: 'Sophie Laurent',
    phoneNumber: '+33 6 34 56 78 90',
    availability: [
      {
        date: new Date('2025-11-01'),
        startTime: '08:00',
        endTime: '17:00',
        status: 'Available'
      },
      {
        date: new Date('2025-11-03'),
        startTime: '08:00',
        endTime: '17:00',
        status: 'Unavailable'
      },
      {
        date: new Date('2025-11-05'),
        startTime: '08:00',
        endTime: '17:00',
        status: 'Available'
      }
    ]
  }
];

// Product/Tour templates for dummy bookings
const TOUR_PRODUCTS = [
  {
    productId: 948155,
    productTitle: 'Louvre Highlights & Mona Lisa Guided Experience',
    externalProductId: '5512924P3',
    productCategory: 'ACTIVITIES',
    rateTitle: 'Louvre Tour for Groups Max 25',
    durationHours: 2,
    durationMinutes: 0
  },
  {
    productId: 948156,
    productTitle: 'Eiffel Tower Summit Access with Guide',
    externalProductId: '5512924P4',
    productCategory: 'ACTIVITIES',
    rateTitle: 'Eiffel Tower Premium Tour',
    durationHours: 3,
    durationMinutes: 0
  },
  {
    productId: 948157,
    productTitle: 'Versailles Palace and Gardens Full Day Tour',
    externalProductId: '5512924P5',
    productCategory: 'ACTIVITIES',
    rateTitle: 'Versailles Complete Experience',
    durationHours: 8,
    durationMinutes: 0
  },
  {
    productId: 948158,
    productTitle: 'Seine River Dinner Cruise',
    externalProductId: '5512924P6',
    productCategory: 'ACTIVITIES',
    rateTitle: 'Evening Seine Cruise',
    durationHours: 2,
    durationMinutes: 30
  },
  {
    productId: 948159,
    productTitle: 'Montmartre Walking Tour with Local Guide',
    externalProductId: '5512924P7',
    productCategory: 'ACTIVITIES',
    rateTitle: 'Montmartre Discovery Walk',
    durationHours: 2,
    durationMinutes: 0
  }
];

// Sample customer names
const CUSTOMER_NAMES = [
  { firstName: 'John', lastName: 'Smith' },
  { firstName: 'Emma', lastName: 'Johnson' },
  { firstName: 'Michael', lastName: 'Williams' },
  { firstName: 'Sarah', lastName: 'Brown' },
  { firstName: 'David', lastName: 'Jones' },
  { firstName: 'Lisa', lastName: 'Garcia' },
  { firstName: 'Robert', lastName: 'Martinez' },
  { firstName: 'Jennifer', lastName: 'Rodriguez' },
  { firstName: 'William', lastName: 'Davis' },
  { firstName: 'Emily', lastName: 'Miller' },
  { firstName: 'James', lastName: 'Wilson' },
  { firstName: 'Jessica', lastName: 'Moore' },
  { firstName: 'Christopher', lastName: 'Taylor' },
  { firstName: 'Amanda', lastName: 'Anderson' },
  { firstName: 'Daniel', lastName: 'Thomas' }
];

/**
 * Generate a random date between start and end dates
 */
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/**
 * Generate random passenger counts
 */
function generatePassengerCounts() {
  const adults = Math.floor(Math.random() * 4) + 1; // 1-4 adults
  const children = Math.floor(Math.random() * 3); // 0-2 children
  const infants = Math.floor(Math.random() * 2); // 0-1 infants

  return {
    totalAdults: adults,
    totalChildren: children,
    totalInfants: infants,
    totalPassengers: adults + children + infants
  };
}

/**
 * Create guide user accounts and Guide profiles
 */
async function createGuides() {
  console.log('\n📋 Creating guide profiles...');

  const createdGuides = [];

  for (const guideProfile of GUIDE_PROFILES) {
    try {
      // Check if user already exists
      let user = await User.findOne({ email: guideProfile.email });

      if (!user) {
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(guideProfile.password, salt);

        // Create user account
        user = new User({
          email: guideProfile.email,
          password: hashedPassword,
          name: guideProfile.name,
          role: 'GUIDE'
        });

        await user.save();
        console.log(`  ✓ Created user account: ${guideProfile.email}`);
      } else {
        console.log(`  ⊘ User already exists: ${guideProfile.email}`);
      }

      // Check if Guide profile already exists
      let guide = await Guide.findOne({ userId: user._id });

      if (!guide) {
        // Create Guide profile
        guide = new Guide({
          userId: user._id,
          guideName: guideProfile.guideName,
          email: guideProfile.email,
          phoneNumber: guideProfile.phoneNumber,
          availability: guideProfile.availability,
          assignedSlots: []
        });

        await guide.save();
        console.log(`  ✓ Created guide profile: ${guideProfile.guideName}`);
      } else {
        console.log(`  ⊘ Guide profile already exists: ${guideProfile.guideName}`);
      }

      createdGuides.push(guide);

    } catch (error) {
      console.error(`  ✗ Error creating guide ${guideProfile.email}:`, error.message);
    }
  }

  return createdGuides;
}

/**
 * Create dummy activity bookings
 */
async function createDummyBookings(guides) {
  console.log('\n📋 Creating dummy activity bookings...');

  const startDate = new Date('2025-11-01');
  const endDate = new Date('2025-11-30');

  let bookingIdCounter = 80000000; // Start from a high number to avoid conflicts
  let parentBookingIdCounter = 90000000;

  const createdBookings = [];

  for (let i = 0; i < 35; i++) {
    try {
      // Select random product
      const product = TOUR_PRODUCTS[Math.floor(Math.random() * TOUR_PRODUCTS.length)];

      // Generate random start date/time
      const startDateTime = randomDate(startDate, endDate);
      startDateTime.setHours(Math.floor(Math.random() * 8) + 9); // 9 AM - 5 PM
      startDateTime.setMinutes(0);
      startDateTime.setSeconds(0);

      // Calculate end date/time
      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(endDateTime.getHours() + product.durationHours);
      endDateTime.setMinutes(endDateTime.getMinutes() + product.durationMinutes);

      // Generate passenger counts
      const passengerCounts = generatePassengerCounts();

      // Select random customer
      const customer = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];

      // Generate passengers array
      const passengers = [];

      // Add adults
      for (let j = 0; j < passengerCounts.totalAdults; j++) {
        passengers.push({
          pricingCategoryId: 1000 + j,
          category: 'Adult',
          quantity: 1,
          ageMin: 18,
          ageMax: 99,
          passengerInfo: {
            passengerInfoId: 2000 + i * 10 + j,
            firstName: j === 0 ? customer.firstName : `Adult${j + 1}`,
            lastName: customer.lastName,
            leadPassenger: j === 0
          }
        });
      }

      // Add children
      for (let j = 0; j < passengerCounts.totalChildren; j++) {
        passengers.push({
          pricingCategoryId: 3000 + j,
          category: 'Child',
          quantity: 1,
          ageMin: 3,
          ageMax: 17,
          passengerInfo: {
            passengerInfoId: 4000 + i * 10 + j,
            firstName: `Child${j + 1}`,
            lastName: customer.lastName,
            leadPassenger: false
          }
        });
      }

      // Add infants
      for (let j = 0; j < passengerCounts.totalInfants; j++) {
        passengers.push({
          pricingCategoryId: 5000 + j,
          category: 'Infant',
          quantity: 1,
          ageMin: 0,
          ageMax: 2,
          passengerInfo: {
            passengerInfoId: 6000 + i * 10 + j,
            firstName: `Infant${j + 1}`,
            lastName: customer.lastName,
            leadPassenger: false
          }
        });
      }

      // Calculate price (random between 40-150 EUR)
      const totalPrice = Math.floor(Math.random() * 110) + 40;

      // Create booking
      const booking = new ActivityBooking({
        parentBookingId: parentBookingIdCounter++,
        bookingId: bookingIdCounter++,
        confirmationCode: `VIA-${bookingIdCounter}`,
        productConfirmationCode: `UNC-T${bookingIdCounter}`,
        status: 'CONFIRMED',
        productId: product.productId,
        productTitle: product.productTitle,
        externalProductId: product.externalProductId,
        rateTitle: product.rateTitle,
        productCategory: product.productCategory,
        supplierId: 112548,
        supplierTitle: 'Uncle Sam Tours Private Limited',
        supplierEmail: 'hello@unclesam.tours',
        supplierPhone: '+91 9642290666',
        supplierWebsite: 'unclesam.tours',
        startDateTime: startDateTime,
        endDateTime: endDateTime,
        durationHours: product.durationHours,
        durationMinutes: product.durationMinutes,
        totalPrice: totalPrice,
        priceWithDiscount: totalPrice,
        currency: 'EUR',
        passengers: passengers,
        totalAdults: passengerCounts.totalAdults,
        totalChildren: passengerCounts.totalChildren,
        totalInfants: passengerCounts.totalInfants,
        totalPassengers: passengerCounts.totalPassengers,
        bookingAnswers: [],
        barcode: `UNC-T${bookingIdCounter}`,
        description: `${product.productTitle} tour booking`,
        cancellationPolicyTitle: 'Standard Viator policy'
      });

      await booking.save();
      createdBookings.push(booking);

      if ((i + 1) % 10 === 0) {
        console.log(`  ✓ Created ${i + 1} bookings...`);
      }

    } catch (error) {
      console.error(`  ✗ Error creating booking ${i + 1}:`, error.message);
    }
  }

  console.log(`  ✓ Total bookings created: ${createdBookings.length}`);
  return createdBookings;
}

/**
 * Create time slots for some bookings
 */
async function createTimeSlotsForBookings(bookings, guides) {
  console.log('\n📋 Creating time slots for bookings...');

  // Group bookings by product and start time
  const slotMap = new Map();

  for (const booking of bookings) {
    const key = `${booking.productId}-${booking.startDateTime.getTime()}`;

    if (!slotMap.has(key)) {
      slotMap.set(key, []);
    }

    slotMap.get(key).push(booking);
  }

  console.log(`  Found ${slotMap.size} unique time slots`);

  let slotsCreated = 0;

  for (const [key, slotBookings] of slotMap.entries()) {
    try {
      const firstBooking = slotBookings[0];

      // Check if slot already exists
      const existingSlot = await TimeSlot.findOne({
        productId: firstBooking.productId,
        startDateTime: firstBooking.startDateTime
      });

      if (existingSlot) {
        console.log(`  ⊘ Slot already exists for ${firstBooking.productTitle} at ${firstBooking.startDateTime}`);
        continue;
      }

      // Calculate total passengers for this slot
      const totalPassengers = slotBookings.reduce((sum, b) => sum + b.totalPassengers, 0);

      // Randomly assign a guide (50% chance)
      const assignGuide = Math.random() > 0.5;
      const randomGuide = assignGuide ? guides[Math.floor(Math.random() * guides.length)] : null;

      // Create time slot
      const slot = new TimeSlot({
        productId: firstBooking.productId,
        productTitle: firstBooking.productTitle,
        startDateTime: firstBooking.startDateTime,
        endDateTime: firstBooking.endDateTime,
        maxCapacity: 25,
        currentPassengerCount: totalPassengers,
        bookingCount: slotBookings.length,
        assignedGuideId: randomGuide ? randomGuide._id : null,
        assignedGuideName: randomGuide ? randomGuide.guideName : null,
        status: randomGuide ? 'ASSIGNED' : 'UNASSIGNED',
        isSplitSlot: false,
        createdReason: 'initial'
      });

      await slot.save();

      // Update bookings with slot ID
      for (const booking of slotBookings) {
        booking.slotId = slot._id;
        if (randomGuide) {
          booking.guideId = randomGuide._id;
        }
        await booking.save();
      }

      // Update guide's assigned slots
      if (randomGuide) {
        if (!randomGuide.assignedSlots.includes(slot._id)) {
          randomGuide.assignedSlots.push(slot._id);
          await randomGuide.save();
        }
      }

      slotsCreated++;

    } catch (error) {
      console.error(`  ✗ Error creating slot:`, error.message);
    }
  }

  console.log(`  ✓ Created ${slotsCreated} time slots`);
}

/**
 * Main seed function
 */
async function seedData() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');
    console.log(`  Database: ${mongoose.connection.db.databaseName}`);

    // Create guides
    const guides = await createGuides();

    if (guides.length === 0) {
      console.log('\n⚠️  No guides were created. Exiting...');
      await mongoose.connection.close();
      return;
    }

    // Create dummy bookings
    const bookings = await createDummyBookings(guides);

    // Create time slots
    await createTimeSlotsForBookings(bookings, guides);

    console.log('\n✅ Seed data created successfully!');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log(`  Guides created: ${guides.length}`);
    console.log(`  Bookings created: ${bookings.length}`);
    console.log('\n🔐 Guide Login Credentials:');
    for (const profile of GUIDE_PROFILES) {
      console.log(`  📧 ${profile.email}`);
      console.log(`  🔑 ${profile.password}`);
      console.log('');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error seeding data:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedData();
