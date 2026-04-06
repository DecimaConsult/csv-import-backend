import express from 'express';
import { 
  uploadReceipt,
  getReceiptById,
  getReceiptBySubSlot,
  getReceiptBySlot,
  serveReceiptImage
} from '../controllers/receiptController.js';
import { requireRole } from '../middleware/auth.js';
import { uploadMiddleware } from '../services/fileUploadService.js';

const router = express.Router();

/**
 * POST /api/receipts/upload
 * Upload a receipt photo for a sub-slot
 * Body (multipart/form-data):
 *   - file: Receipt image (JPG/PNG, max 7MB)
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (e.g., "A", "B", "C") - optional for non-sub-slot products
 *   - notes: Optional notes from guide
 * Returns: Created receipt document
 * Auth: GUIDE, COORDINATOR, or ADMIN
 */
router.post(
  '/upload', 
  requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), 
  uploadMiddleware.single('file'),
  uploadReceipt
);

/**
 * GET /api/receipts/:receiptId
 * Get receipt details by ID
 * Params:
 *   - receiptId: MongoDB ObjectId of the receipt
 * Returns: Receipt document
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/:receiptId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getReceiptById);

/**
 * GET /api/receipts/image/:receiptId
 * Serve receipt image file
 * Params:
 *   - receiptId: MongoDB ObjectId of the receipt
 * Returns: Image file
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/image/:receiptId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), serveReceiptImage);

/**
 * GET /api/receipts/slot/:slotId/sub-slot/:subSlotId
 * Get receipt for a specific sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (e.g., "A", "B", "C")
 * Returns: Receipt document
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/slot/:slotId/sub-slot/:subSlotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getReceiptBySubSlot);

/**
 * GET /api/receipts/slot/:slotId
 * Get receipt for a time slot (non-sub-slot products)
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Receipt document
 * Auth: GUIDE (assigned only), COORDINATOR, or ADMIN
 */
router.get('/slot/:slotId', requireRole(['GUIDE', 'ADMIN', 'STAFF', 'COORDINATOR']), getReceiptBySlot);

export default router;
