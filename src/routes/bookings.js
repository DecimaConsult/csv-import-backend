import express from 'express';
import { getBookings, getBookingById, importBooking } from '../controllers/bookingController.js';
import { requireRole } from '../middleware/auth.js';
import { filterBookingResponse } from '../middleware/roleBasedFilter.js';

const router = express.Router();

/**
 * GET /api/bookings
 * Get bookings with optional filters
 * Query params:
 *   - slotId: MongoDB ObjectId (filter bookings by slot)
 * Returns: Array of booking objects with passenger details
 * Auth: ADMIN, STAFF, and COORDINATOR
 * Note: Filtering middleware is applied for role-based data access
 */
router.get('/', requireRole(['ADMIN', 'STAFF', 'COORDINATOR']), filterBookingResponse, getBookings);

/**
 * POST /api/bookings/import
 * Import booking from Bokun by confirmation code
 * Body:
 *   - confirmationCode: Bokun confirmation code (e.g., "VIA-70887957")
 * Returns: Imported booking details with slot assignments
 * Auth: ADMIN, STAFF
 */
router.post('/import', requireRole(['ADMIN', 'STAFF']), importBooking);

/**
 * GET /api/bookings/:bookingId
 * Get full booking details by booking ID
 * Params:
 *   - bookingId: Bokun booking ID (numeric)
 * Returns: Booking object with all activity bookings and passenger details
 * Auth: ADMIN, STAFF, and COORDINATOR
 * Note: Filtering middleware is applied for role-based data access
 */
router.get('/:bookingId', requireRole(['ADMIN', 'STAFF', 'COORDINATOR']), filterBookingResponse, getBookingById);

export default router;
