import express from 'express';
import { 
  getAdminUpcomingDepartures,
  getAdminCalendarDate,
  getGuideAssignedTours
} from '../controllers/dashboardController.js';
import { requireRole, authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/dashboard/admin/upcoming
 * Get upcoming departures separated into next 10 days and remaining
 * Query params:
 *   - page: number (default: 1)
 * Returns: Grouped departures with pagination
 * Auth: ADMIN and COORDINATOR
 */
router.get('/admin/upcoming', requireRole(['ADMIN', 'STAFF', 'COORDINATOR']), getAdminUpcomingDepartures);

/**
 * GET /api/dashboard/admin/calendar/:date
 * Get all time slots for a specific date
 * Params:
 *   - date: YYYY-MM-DD format
 * Query params:
 *   - productId: number (optional, filter by product)
 * Returns: Time slots grouped by product
 * Auth: ADMIN and COORDINATOR
 */
router.get('/admin/calendar/:date', requireRole(['ADMIN', 'STAFF', 'COORDINATOR']), getAdminCalendarDate);

/**
 * GET /api/dashboard/guide/assigned
 * Get guide's assigned sub-slots and tours
 * Returns: List of assigned tours with passenger information
 * Auth: GUIDE only (authenticated guide)
 */
router.get('/guide/assigned', authenticate, getGuideAssignedTours);

export default router;
