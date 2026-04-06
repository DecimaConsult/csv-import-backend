import express from 'express';
import { uploadAndImport, getImportHistory } from '../controllers/importController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/import/upload
 * Upload and import bookings from spreadsheet
 * Body (multipart/form-data):
 *   - file: Excel file (.xlsx, .xls)
 *   - pin: 4-digit PIN for verification
 *   - skipExisting: 'true' to skip existing bookings (optional)
 * Auth: ADMIN only
 * Note: PIN verification happens inside uploadAndImport after multer processes the form
 */
router.post('/upload', requireRole('ADMIN'), uploadAndImport);

/**
 * GET /api/import/history
 * Get import history (last 20 sessions)
 * Auth: ADMIN only
 */
router.get('/history', requireRole('ADMIN'), getImportHistory);

export default router;
