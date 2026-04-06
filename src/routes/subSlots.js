import express from 'express';
import { 
  getSubSlots, 
  getSubSlotById, 
  assignGuideToSubSlot,
  unassignGuideFromSubSlot
} from '../controllers/subSlotController.js';
import { requireRole, authenticate } from '../middleware/auth.js';
import { filterSubSlotResponse } from '../middleware/roleBasedFilter.js';

const router = express.Router();

/**
 * GET /api/slots/:slotId/sub-slots
 * Get all sub-slots for a specific time slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Array of sub-slot objects with ticket cost calculations
 * Auth: Authenticated users (ADMIN and GUIDE)
 * Data Filtering:
 *   - Admins see all data including detailed pricing breakdown
 *   - Guides see limited data (total cost only, no pricing details)
 */
router.get('/:slotId/sub-slots', authenticate, filterSubSlotResponse, getSubSlots);

/**
 * GET /api/slots/:slotId/sub-slots/:subSlotId
 * Get specific sub-slot details with bookings
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (A, B, C, etc.)
 * Returns: Sub-slot object with bookings and ticket cost calculation
 * Auth: Authenticated users (ADMIN and GUIDE)
 * Access Control:
 *   - Admins can view any sub-slot
 *   - Guides can only view sub-slots assigned to them
 * Data Filtering:
 *   - Admins see all booking data including source and metadata
 *   - Guides see passenger info only (no booking source or metadata)
 */
router.get('/:slotId/sub-slots/:subSlotId', authenticate, filterSubSlotResponse, getSubSlotById);

/**
 * PUT /api/slots/:slotId/sub-slots/:subSlotId/assign-guide
 * Assign a guide to a specific sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (A, B, C, etc.)
 * Body:
 *   - guideId: MongoDB ObjectId of the guide to assign
 * Returns: Updated sub-slot object
 * Auth: ADMIN only
 */
router.put('/:slotId/sub-slots/:subSlotId/assign-guide', requireRole(['ADMIN', 'STAFF']), assignGuideToSubSlot);

/**
 * DELETE /api/slots/:slotId/sub-slots/:subSlotId/guide
 * Unassign guide from a specific sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (A, B, C, etc.)
 * Returns: Updated sub-slot object
 * Auth: ADMIN only
 */
router.delete('/:slotId/sub-slots/:subSlotId/guide', requireRole(['ADMIN', 'STAFF']), unassignGuideFromSubSlot);

export default router;
