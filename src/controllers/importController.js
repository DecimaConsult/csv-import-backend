import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import Booking from '../models/Booking.js';
import ActivityBooking from '../models/ActivityBooking.js';
import Product from '../models/Product.js';
import TimeSlot from '../models/TimeSlot.js';
import WebhookService from '../services/webhookService.js';

const execAsync = promisify(exec);

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'imports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'import-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
}).single('file');

// Verify PIN (called AFTER multer processes the form)
const verifyPin = (pin) => {
  const correctPin = process.env.IMPORT_PIN || '1234'; // Default for development
  
  if (!pin) {
    throw new Error('PIN is required');
  }
  
  if (pin !== correctPin) {
    throw new Error('Invalid PIN');
  }
  
  return true;
};

// Helper functions (from seed-from-spreadsheet.js)
function parseCustomerName(customerStr) {
  if (!customerStr) return { firstName: '', lastName: '' };
  const parts = customerStr.split(',').map(s => s.trim());
  return {
    lastName: parts[0] || '',
    firstName: parts[1] || ''
  };
}

function parsePhoneNumber(phoneStr) {
  if (!phoneStr) return { phoneNumber: '' };
  const match = phoneStr.match(/^([A-Z]{2})\+(\d+)\s*(.+)$/);
  if (match) {
    return {
      countryCode: match[1],
      fullNumber: `+${match[2]} ${match[3]}`,
      phoneNumber: phoneStr
    };
  }
  return { phoneNumber: phoneStr };
}

function parseParticipants(participantsStr) {
  if (!participantsStr) return [];
  const passengers = [];
  const parts = participantsStr.split(',').map(s => s.trim());
  
  for (const part of parts) {
    const match = part.match(/^(\w+):\s*(\d+)$/);
    if (match) {
      passengers.push({
        category: match[1],
        quantity: parseInt(match[2]),
        checkInStatus: { isCheckedIn: false }
      });
    }
  }
  return passengers;
}

function calculatePassengerTotals(passengers) {
  const totals = {
    totalAdults: 0,
    totalYouth: 0,
    totalChildren: 0,
    totalInfants: 0,
    totalPassengers: 0
  };
  
  for (const passenger of passengers) {
    const qty = passenger.quantity || 0;
    const cat = passenger.category?.toLowerCase();
    
    if (cat === 'adult') totals.totalAdults += qty;
    else if (cat === 'youth') totals.totalYouth += qty;
    else if (cat === 'child') totals.totalChildren += qty;
    else if (cat === 'infant') totals.totalInfants += qty;
    
    totals.totalPassengers += qty;
  }
  
  return totals;
}

function extractBookingSource(bookingChannel, seller) {
  const channel = (bookingChannel || '').toUpperCase();
  const sellerStr = (seller || '').toUpperCase();
  
  if (channel.includes('VIATOR') || sellerStr.includes('VIATOR')) return 'VIATOR';
  if (channel.includes('GETYOURGUIDE') || sellerStr.includes('GETYOURGUIDE')) return 'GETYOURGUIDE';
  if (channel.includes('TRIPADVISOR') || sellerStr.includes('TRIPADVISOR')) return 'TRIPADVISOR';
  if (channel.includes('WEBSITE') || channel.includes('WEB')) return 'WEBSITE';
  if (channel.includes('DIRECT')) return 'DIRECT';
  if (channel || sellerStr) return 'OTHER';
  
  return 'UNKNOWN';
}

function transformRowToBooking(row, importSessionId) {
  const customer = parseCustomerName(row['Customer']);
  const phone = parsePhoneNumber(row['Phone number']);
  const passengers = parseParticipants(row['Participants']);
  const passengerTotals = calculatePassengerTotals(passengers);
  
  const importMetadata = {
    dataSource: 'SPREADSHEET_SEED',
    lastSpreadsheetImport: new Date(),
    importSessionId,
    spreadsheetRow: row._rowNumber
  };
  
  const parentBooking = {
    bookingId: parseInt(row['External Booking Ref.']),
    confirmationCode: row['Cart confirmation code'],
    externalBookingReference: row['External Booking Ref.'],
    status: row['Status'] || 'CONFIRMED',
    creationDate: row['Creation date'] ? new Date(row['Creation date']) : new Date(),
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: row['Email'],
    phoneNumber: phone.phoneNumber,
    currency: row['Sale currency'],
    totalPrice: row['Total price with discount'],
    bookingChannelTitle: row['Booking channel'],
    sellerTitle: row['Seller'],
    ...importMetadata
  };
  
  const activityBooking = {
    parentBookingId: parseInt(row['External Booking Ref.']),
    bookingId: parseInt(row['External Booking Ref.']),
    confirmationCode: row['Cart confirmation code'],
    productConfirmationCode: row['Product confirmation code'],
    status: row['Status'] || 'CONFIRMED',
    productId: row['Product ID'] ? String(row['Product ID']).replace(/[^0-9]/g, '') : null,
    productTitle: row['Product title'],
    rateTitle: row['Rate title'],
    supplierTitle: row['Supplier'],
    startDateTime: row['Start date'] ? new Date(row['Start date']) : null,
    endDateTime: row['End date'] ? new Date(row['End date']) : null,
    totalPrice: row['Total price with discount'],
    priceWithDiscount: row['Total price with discount'],
    currency: row['Sale currency'],
    passengers,
    ...passengerTotals,
    bookingSource: extractBookingSource(row['Booking channel'], row['Seller']),
    bookingAnswers: row['Notes'] ? [{ question: 'Notes', answer: row['Notes'] }] : [],
    checkInStatus: { isCheckedIn: false },
    ...importMetadata
  };
  
  return { parentBooking, activityBooking };
}

// Read spreadsheet
async function readSpreadsheet(filePath) {
  const pythonScript = `
import pandas as pd
import json
import sys

try:
    df = pd.read_excel('${filePath}')
    records = df.to_dict('records')
    
    for record in records:
        for key, value in record.items():
            if pd.isna(value):
                record[key] = None
            elif isinstance(value, pd.Timestamp):
                record[key] = value.isoformat()
    
    print(json.dumps(records))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

  const { stdout } = await execAsync(`python3 -c "${pythonScript.replace(/"/g, '\\"')}"`);
  return JSON.parse(stdout);
}

// Process bookings with progress tracking
async function processBookings(rows, skipExisting = false, progressCallback = null) {
  const importSessionId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const results = {
    total: rows.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    productsCreated: 0,
    slotsCreated: 0,
    errors: [],
    sessionId: importSessionId
  };
  
  // Helper to report progress
  const reportProgress = (stage, current, total, message) => {
    if (progressCallback) {
      progressCallback({
        stage,
        current,
        total,
        percentage: total > 0 ? Math.round((current / total) * 100) : 0,
        message
      });
    }
  };
  
  // Pre-fetch existing bookings if skip mode
  let existingBookingIds = new Set();
  if (skipExisting) {
    const existingBookings = await ActivityBooking.find({
      bookingId: { $in: rows.map(r => parseInt(r['External Booking Ref.'])).filter(Boolean) }
    }).select('bookingId').lean();
    existingBookingIds = new Set(existingBookings.map(b => b.bookingId));
  }
  
  // Collect unique products and slots needed
  const productsNeeded = new Map(); // productId -> { productTitle, bookings }
  const slotsNeeded = new Map(); // "productId_startDateTime" -> { productId, productTitle, startDateTime }
  
  for (const row of rows) {
    if (!row['External Booking Ref.'] || !row['Product ID'] || !row['Start date']) continue;
    
    const productId = String(row['Product ID']).replace(/[^0-9]/g, '');
    const productTitle = row['Product title'];
    const startDateTime = new Date(row['Start date']);
    
    if (!productsNeeded.has(productId)) {
      productsNeeded.set(productId, { productTitle, count: 0 });
    }
    productsNeeded.get(productId).count++;
    
    const slotKey = `${productId}_${startDateTime.toISOString()}`;
    if (!slotsNeeded.has(slotKey)) {
      slotsNeeded.set(slotKey, { productId, productTitle, startDateTime });
    }
  }
  
  // Create missing products (OPTIMIZED - bulk query + bulk insert)
  console.log(`\n📦 Checking ${productsNeeded.size} unique products...`);
  reportProgress('products', 0, productsNeeded.size, 'Checking products...');
  
  // Bulk query existing products
  const productIds = Array.from(productsNeeded.keys());
  const existingProducts = await Product.find({ 
    productId: { $in: productIds } 
  }).select('productId').lean();
  const existingProductIds = new Set(existingProducts.map(p => p.productId));
  
  // Prepare bulk insert for missing products
  const productsToCreate = [];
  for (const [productId, { productTitle }] of productsNeeded) {
    if (!existingProductIds.has(productId)) {
      console.log(`  ➕ Creating product: ${productId} - ${productTitle}`);
      productsToCreate.push({
        productId,
        name: productTitle,
        nickname: productTitle,
        requiresSubSlots: false,
        subSlotCapacity: 25,
        requiresTickets: false,
        ticketPricing: {
          adult: 0,
          youth: 0,
          child: 0
        },
        active: true
      });
    }
  }
  
  // Bulk insert all missing products at once
  if (productsToCreate.length > 0) {
    await Product.insertMany(productsToCreate, { ordered: false });
    results.productsCreated = productsToCreate.length;
  }
  
  reportProgress('products', productsNeeded.size, productsNeeded.size, `Processed ${productsNeeded.size}/${productsNeeded.size} products`);
  
  // Create missing time slots (OPTIMIZED - bulk query + bulk insert)
  console.log(`\n🕐 Checking ${slotsNeeded.size} unique time slots...`);
  reportProgress('slots', 0, slotsNeeded.size, 'Checking time slots...');
  
  // Build query for existing slots
  const slotQueries = Array.from(slotsNeeded.values()).map(({ productId, startDateTime }) => ({
    productId: parseInt(productId),
    startDateTime
  }));
  
  // Bulk query existing slots
  const existingSlots = await TimeSlot.find({
    $or: slotQueries
  }).select('productId startDateTime').lean();
  
  // Create a Set of existing slot keys for fast lookup
  const existingSlotKeys = new Set(
    existingSlots.map(s => `${s.productId}_${s.startDateTime.toISOString()}`)
  );
  
  // Prepare bulk insert for missing slots
  const slotsToCreate = [];
  for (const [slotKey, { productId, productTitle, startDateTime }] of slotsNeeded) {
    if (!existingSlotKeys.has(slotKey)) {
      console.log(`  ➕ Creating slot: ${productTitle} at ${startDateTime}`);
      slotsToCreate.push({
        productId: parseInt(productId),
        productTitle,
        startDateTime,
        endDateTime: new Date(startDateTime.getTime() + 3 * 60 * 60 * 1000), // +3 hours default
        requiresSubSlots: false,
        maxCapacity: 25,
        currentPassengerCount: 0,
        bookingCount: 0,
        status: 'UNASSIGNED',
        createdReason: 'initial'
      });
    }
  }
  
  // Bulk insert all missing slots at once
  if (slotsToCreate.length > 0) {
    await TimeSlot.insertMany(slotsToCreate, { ordered: false });
    results.slotsCreated = slotsToCreate.length;
  }
  
  reportProgress('slots', slotsNeeded.size, slotsNeeded.size, `Processed ${slotsNeeded.size}/${slotsNeeded.size} time slots`);
  
  console.log(`\n✅ Products created: ${results.productsCreated}, Slots created: ${results.slotsCreated}`);
  console.log(`\n📝 Processing ${rows.length} bookings...\n`);
  
  // Process in batches
  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }
  
  reportProgress('bookings', 0, rows.length, 'Starting booking import...');
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStart = batchIndex * BATCH_SIZE;
    
    // Report progress at start of each batch
    reportProgress('bookings', batchStart, rows.length, `Processing batch ${batchIndex + 1}/${batches.length}...`);
    
    const bulkParentOps = [];
    const bulkActivityOps = [];
    const slotAssignments = [];
    
    for (let i = 0; i < batch.length; i++) {
      const row = { ...batch[i], _rowNumber: batchStart + i + 1 };
      
      try {
        if (!row['External Booking Ref.']) {
          results.skipped++;
          continue;
        }
        
        const bookingId = parseInt(row['External Booking Ref.']);
        
        if (skipExisting && existingBookingIds.has(bookingId)) {
          results.skipped++;
          continue;
        }
        
        const { parentBooking, activityBooking } = transformRowToBooking(row, importSessionId);
        
        bulkParentOps.push({
          updateOne: {
            filter: { bookingId: parentBooking.bookingId },
            update: { 
              $set: parentBooking,
              $setOnInsert: { createdAt: new Date() }
            },
            upsert: true
          }
        });
        
        bulkActivityOps.push({
          updateOne: {
            filter: { bookingId: activityBooking.bookingId },
            update: { 
              $set: activityBooking,
              $setOnInsert: { createdAt: new Date() }
            },
            upsert: true
          }
        });
        
        slotAssignments.push({
          bookingId: activityBooking.bookingId,
          productId: activityBooking.productId,
          startDateTime: activityBooking.startDateTime
        });
        
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: row._rowNumber,
          customer: row['Customer'],
          error: error.message
        });
      }
    }
    
    // Execute bulk operations
    try {
      if (bulkParentOps.length > 0) {
        const parentResult = await Booking.bulkWrite(bulkParentOps, { ordered: false });
        results.created += parentResult.upsertedCount || 0;
        results.updated += parentResult.modifiedCount || 0;
      }
      
      if (bulkActivityOps.length > 0) {
        const activityResult = await ActivityBooking.bulkWrite(bulkActivityOps, { ordered: false });
        results.created += activityResult.upsertedCount || 0;
        results.updated += activityResult.modifiedCount || 0;
        results.successful += bulkActivityOps.length;
      }
      
      // Slot assignment (OPTIMIZED - batch fetch bookings)
      const SLOT_CONCURRENCY = 50; // Increased from 10
      
      // Fetch all bookings for this batch at once
      const bookingIds = slotAssignments.map(a => a.bookingId);
      const activityBookingDocs = await ActivityBooking.find({
        bookingId: { $in: bookingIds }
      }).lean();
      
      // Create a map for fast lookup
      const bookingMap = new Map(activityBookingDocs.map(b => [b.bookingId, b]));
      
      // Process slot assignments with higher concurrency
      for (let i = 0; i < slotAssignments.length; i += SLOT_CONCURRENCY) {
        const slotBatch = slotAssignments.slice(i, i + SLOT_CONCURRENCY);
        await Promise.allSettled(
          slotBatch.map(async (assignment) => {
            try {
              const activityBookingDoc = bookingMap.get(assignment.bookingId);
              if (activityBookingDoc) {
                await WebhookService.assignToSlotOrSubSlot(activityBookingDoc);
              }
            } catch (slotError) {
              // Continue on slot assignment error
            }
          })
        );
      }
      
      // Report progress after batch completion
      const processedSoFar = Math.min((batchIndex + 1) * BATCH_SIZE, rows.length);
      reportProgress('bookings', processedSoFar, rows.length, `Processed ${processedSoFar}/${rows.length} bookings`);
      
    } catch (bulkError) {
      results.failed += bulkParentOps.length;
      results.errors.push({
        batch: batchIndex + 1,
        error: bulkError.message
      });
    }
  }
  
  reportProgress('complete', rows.length, rows.length, 'Import completed!');
  
  return results;
}

// Controller: Upload and import
export const uploadAndImport = async (req, res) => {
  try {
    // Handle file upload
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Verify PIN after multer has processed the form data
      try {
        verifyPin(req.body.pin);
      } catch (pinError) {
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(pinError.message === 'Invalid PIN' ? 403 : 400).json({ 
          error: pinError.message 
        });
      }
      
      const { skipExisting } = req.body;
      const filePath = req.file.path;
      
      try {
        // Read spreadsheet
        console.log('📖 Reading spreadsheet...');
        const rows = await readSpreadsheet(filePath);
        
        if (!rows || rows.length === 0) {
          fs.unlinkSync(filePath); // Clean up
          return res.status(400).json({ error: 'Spreadsheet is empty or invalid' });
        }
        
        console.log(`✅ Found ${rows.length} rows in spreadsheet`);
        
        // Process bookings with progress logging
        const progressLogs = [];
        const results = await processBookings(rows, skipExisting === 'true', (progress) => {
          // Log progress to console
          console.log(`[${progress.stage.toUpperCase()}] ${progress.percentage}% - ${progress.message}`);
          progressLogs.push({
            timestamp: new Date(),
            ...progress
          });
        });
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        console.log('\n✅ Import completed successfully!');
        console.log(`   Total: ${results.total}`);
        console.log(`   Successful: ${results.successful}`);
        console.log(`   Failed: ${results.failed}`);
        console.log(`   Skipped: ${results.skipped}`);
        console.log(`   Products created: ${results.productsCreated}`);
        console.log(`   Slots created: ${results.slotsCreated}\n`);
        
        res.json({
          success: true,
          message: 'Import completed',
          results: {
            ...results,
            summary: `Imported ${results.successful} bookings, created ${results.productsCreated} products and ${results.slotsCreated} slots`,
            progressLogs: progressLogs.slice(-10) // Return last 10 progress updates
          }
        });
        
      } catch (error) {
        // Clean up on error
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        throw error;
      }
    });
    
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ 
      error: 'Import failed', 
      message: error.message 
    });
  }
};

// Controller: Get import history
export const getImportHistory = async (req, res) => {
  try {
    const sessions = await ActivityBooking.aggregate([
      {
        $match: {
          dataSource: 'SPREADSHEET_SEED',
          importSessionId: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$importSessionId',
          count: { $sum: 1 },
          firstImport: { $min: '$lastSpreadsheetImport' },
          lastImport: { $max: '$lastSpreadsheetImport' }
        }
      },
      {
        $sort: { firstImport: -1 }
      },
      {
        $limit: 20
      }
    ]);
    
    res.json({ sessions });
    
  } catch (error) {
    console.error('Get import history error:', error);
    res.status(500).json({ 
      error: 'Failed to get import history', 
      message: error.message 
    });
  }
};

export { upload };
