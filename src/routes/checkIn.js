import express from 'express';
import { 
  checkInBooking,
  checkInPassenger, 
  getSubSlotCheckInStatus,
  getSlotCheckInStatus 
} from '../controllers/checkInController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/check-in/booking
 * Check in an entire booking (all passengers at once)
 * Body:
 *   - bookingId: MongoDB ObjectId of the booking
 * Returns: Updated booking with check-in status
 * Auth: GUIDE, COORDINATOR, or ADMIN
 */
router.post('/booking', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), checkInBooking);

/**
 * POST /api/check-in/passenger (LEGACY - DEPRECATED)
 * Check in a single passenger
 * Body:
 *   - bookingId: MongoDB ObjectId of the booking
 *   - passengerIndex: Index of the passenger in the passengers array
 * Returns: Updated booking with check-in status
 * Auth: GUIDE, COORDINATOR, or ADMIN
 * 
 * NOTE: This endpoint is deprecated. Use /api/check-in/booking instead.
 */
router.post('/passenger', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), checkInPassenger);

/**
 * POST /api/check-in (LEGACY - DEPRECATED)
 * Alias for /api/check-in/passenger for backward compatibility
 */
router.post('/', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), checkInPassenger);

/**
 * GET /api/check-in/slot/:slotId/sub-slot/:subSlotId
 * Get check-in status for all passengers in a sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (e.g., "A", "B", "C")
 * Returns: Array of bookings with passenger check-in status
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/slot/:slotId/sub-slot/:subSlotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getSubSlotCheckInStatus);

/**
 * GET /api/check-in/slot/:slotId
 * Get check-in status for all passengers in a time slot (for non-sub-slot products)
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Array of bookings with passenger check-in status
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/slot/:slotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getSlotCheckInStatus);

export default router;
