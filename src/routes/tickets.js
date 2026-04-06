import express from 'express';
import { 
  uploadTicket,
  getTicketInfo,
  downloadTicket,
  deleteTicket
} from '../controllers/ticketController.js';
import { requireRole } from '../middleware/auth.js';
import { ticketUploadMiddleware } from '../services/fileUploadService.js';

const router = express.Router();

/**
 * POST /api/tickets/upload
 * Upload a ticket file for a slot or sub-slot
 * Body (multipart/form-data):
 *   - file: Ticket file (PDF, max 10MB)
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (optional)
 * Returns: Ticket file info
 * Auth: ADMIN only
 */
router.post(
  '/upload',
  requireRole(['ADMIN', 'STAFF']),
  ticketUploadMiddleware.single('file'),
  uploadTicket
);

/**
 * GET /api/tickets/slot/:slotId
 * Get ticket info for a slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Ticket file info
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/slot/:slotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getTicketInfo);

/**
 * GET /api/tickets/slot/:slotId/sub-slot/:subSlotId
 * Get ticket info for a sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier
 * Returns: Ticket file info
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/slot/:slotId/sub-slot/:subSlotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getTicketInfo);

/**
 * GET /api/tickets/download/:slotId
 * Download ticket file for a slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Ticket file
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/download/:slotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), downloadTicket);

/**
 * GET /api/tickets/download/:slotId/sub-slot/:subSlotId
 * Download ticket file for a sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier
 * Returns: Ticket file
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/download/:slotId/sub-slot/:subSlotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), downloadTicket);

/**
 * DELETE /api/tickets/slot/:slotId
 * Delete ticket file for a slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Success message
 * Auth: ADMIN only
 */
router.delete('/slot/:slotId', requireRole(['ADMIN', 'STAFF']), deleteTicket);

/**
 * DELETE /api/tickets/slot/:slotId/sub-slot/:subSlotId
 * Delete ticket file for a sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier
 * Returns: Success message
 * Auth: ADMIN only
 */
router.delete('/slot/:slotId/sub-slot/:subSlotId', requireRole(['ADMIN', 'STAFF']), deleteTicket);

export default router;
