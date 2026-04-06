import express from 'express';
import { getSlots, getSlotById, assignGuide, unassignGuide, getPastTours } from '../controllers/slotController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/slots/completed-tours
 * Get past completed tours with pagination
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20)
 *   - productId: Filter by product ID
 *   - guideId: Filter by guide ID
 * Returns: Array of past tour objects with pagination info
 * Auth: ADMIN and COORDINATOR
 */
router.get('/completed-tours', requireRole(['ADMIN', 'STAFF', 'COORDINATOR']), getPastTours);

/**
 * GET /api/slots
 * Get all slots with optional filters
 * Query params:
 *   - startDate: ISO date string (filter slots starting from this date)
 *   - endDate: ISO date string (filter slots ending before this date)
 *   - status: Slot status (UNASSIGNED, ASSIGNED, FULL, CANCELLED, EMPTY)
 *   - productId: Product/activity ID
 * Returns: Array of slot objects
 * Auth: ADMIN and COORDINATOR
 */
router.get('/', requireRole(['ADMIN', 'STAFF', 'COORDINATOR']), getSlots);

/**
 * GET /api/slots/:slotId
 * Get slot details by ID with populated bookings
 * Params:
 *   - slotId: MongoDB ObjectId of the slot
 * Returns: Slot object with populated activity bookings
 * Auth: ADMIN, STAFF, COORDINATOR, or GUIDE (guides can only access their assigned slots)
 */
router.get('/:slotId', requireRole(['ADMIN', 'STAFF', 'COORDINATOR', 'GUIDE']), getSlotById);

/**
 * PUT /api/slots/:slotId/assign-guide
 * Assign a guide to a slot
 * Params:
 *   - slotId: MongoDB ObjectId of the slot
 * Body:
 *   - guideId: MongoDB ObjectId of the guide to assign
 * Returns: Updated slot object
 * Auth: ADMIN only
 */
router.put('/:slotId/assign-guide', requireRole(['ADMIN', 'STAFF']), assignGuide);

/**
 * DELETE /api/slots/:slotId/guide
 * Unassign guide from a slot
 * Params:
 *   - slotId: MongoDB ObjectId of the slot
 * Returns: Updated slot object
 * Auth: ADMIN only
 */
router.delete('/:slotId/guide', requireRole(['ADMIN', 'STAFF']), unassignGuide);

export default router;
