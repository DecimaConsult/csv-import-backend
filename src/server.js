import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDatabase from './config/database.js';
import webhookRoutes from './routes/webhooks.js';
import authRoutes from './routes/auth.js';
import slotRoutes from './routes/slots.js';
import subSlotRoutes from './routes/subSlots.js';
import guideRoutes from './routes/guides.js';
import coordinatorRoutes from './routes/coordinators.js';
import staffRoutes from './routes/staff.js';
import userRoutes from './routes/users.js';
import bookingRoutes from './routes/bookings.js';
import productRoutes from './routes/products.js';
import dashboardRoutes from './routes/dashboard.js';
import checkInRoutes from './routes/checkIn.js';
import receiptRoutes from './routes/receipts.js';
import ticketRoutes from './routes/tickets.js';
import importRoutes from './routes/import.js';
import calendarRoutes from './routes/calendar.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ensureUploadDirectories } from './services/fileUploadService.js';
import emailService from './services/emailService.js';
import calendarService from './services/calendarService.js';

// Get __dirname equivalent in ES modules
// Updated: Guide routes now allow GUIDE role access
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize email service (loads SendGrid config)
// The import above triggers the constructor which logs the status

// Ensure upload directories exist
ensureUploadDirectories();

// Connect to database
connectDatabase();

// Initialize Google Calendar service
calendarService.initialize().catch(err => {
  console.error('Failed to initialize calendar service:', err);
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to capture raw body for HMAC validation (must be before other body parsers)
app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (req.body) {
    req.rawBody = req.body.toString('utf8');
    req.body = JSON.parse(req.rawBody);
  }
  next();
});

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// Request logging middleware (development only)
// Commented out to reduce console noise
// if (process.env.NODE_ENV === 'development') {
//   app.use((req, _res, next) => {
//     console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
//     next();
//   });
// }

// Health check route
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Tour Guide Management API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', calendarRoutes);  // Calendar routes (includes /api/slots/:slotId/invite-guide and /api/calendar/webhook)
app.use('/api/slots', slotRoutes);
app.use('/api/slots', subSlotRoutes);
app.use('/api/guides', guideRoutes);
app.use('/api/coordinators', coordinatorRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/check-in', checkInRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/import', importRoutes);

// Serve frontend static files
const frontendDistPath = path.join(__dirname, '../../frontend/frontend/dist');
app.use(express.static(frontendDistPath));

// Handle React routing - send all non-API requests to index.html
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  } else {
    next();
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

export default app;
