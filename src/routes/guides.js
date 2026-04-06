import express from 'express';
import { 
  getGuides, 
  getGuideAvailability, 
  updateGuideAvailability,
  deleteGuideAvailability,
  getGuideAssignments,
  createGuide,
  setupPassword,
  updateGuideProfile,
  getGuidesForAssignment
} from '../controllers/guideController.js';
import { requireRole, authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/guides
 * Create a new guide with password setup email
 * Body:
 *   - guideName: string (required)
 *   - email: string (required)
 *   - phoneNumber: string (optional)
 *   - tier: string (optional, default: STANDARD)
 *   - productSpecializations: array of product IDs (optional)
 * Returns: Created guide object
 * Auth: ADMIN only
 */
router.post('/', requireRole('ADMIN'), createGuide);

/**
 * POST /api/guides/setup-password
 * Setup password using token from email (public endpoint)
 * Body:
 *   - token: string (required)
 *   - password: string (required, min 8 chars)
 * Returns: Success message
 * Auth: None (public endpoint)
 */
router.post('/setup-password', setupPassword);

/**
 * GET /api/guides
 * Get all guides with optional availability filtering
 * Query params:
 *   - date: ISO date string (filter guides available on this date)
 * Returns: Array of guide objects
 * Auth: ADMIN or GUIDE (guides can see all guides for assignment purposes)
 */
router.get('/', requireRole(['ADMIN', 'GUIDE']), getGuides);

/**
 * GET /api/guides/for-assignment
 * Get guides filtered and sorted for assignment
 * Query params:
 *   - productId: Filter by product specialization
 *   - date: ISO date string (for availability check)
 *   - time: Time string in HH:MM format (for availability check)
 * Returns: Guides grouped by tier with availability status
 * Auth: ADMIN only
 */
router.get('/for-assignment', requireRole('ADMIN'), getGuidesForAssignment);

/**
 * PUT /api/guides/:guideId/profile
 * Update guide tier and product specializations
 * Params:
 *   - guideId: MongoDB ObjectId of the guide
 * Body:
 *   - tier: string (PREFERRED | STANDARD | BACKUP)
 *   - productSpecializations: array of product IDs
 * Returns: Updated guide profile
 * Auth: ADMIN only
 */
router.put('/:guideId/profile', requireRole('ADMIN'), updateGuideProfile);

/**
 * GET /api/guides/:guideId/availability
 * Get guide's availability array
 * Params:
 *   - guideId: MongoDB ObjectId of the guide
 * Returns: Guide availability data
 * Auth: ADMIN or own GUIDE
 */
router.get('/:guideId/availability', requireRole(['ADMIN', 'GUIDE']), getGuideAvailability);

/**
 * PUT /api/guides/:guideId/availability
 * Update guide's availability (add or update availability entry)
 * Params:
 *   - guideId: MongoDB ObjectId of the guide
 * Body:
 *   - date: ISO date string (required)
 *   - startTime: Time string (e.g., "09:00") (required)
 *   - endTime: Time string (e.g., "17:00") (required)
 *   - status: "Available" | "Unavailable" | "OnLeave" (required)
 * Returns: Updated guide availability
 * Auth: own GUIDE only (guides can only update their own availability)
 */
router.put('/:guideId/availability', requireRole('GUIDE'), updateGuideAvailability);

/**
 * DELETE /api/guides/:guideId/availability/:date
 * Delete guide's availability entry for a specific date
 * Params:
 *   - guideId: MongoDB ObjectId of the guide
 *   - date: ISO date string
 * Returns: Updated guide availability
 * Auth: own GUIDE only (guides can only delete their own availability)
 */
router.delete('/:guideId/availability/:date', requireRole('GUIDE'), deleteGuideAvailability);

/**
 * GET /api/guides/:guideId/assignments
 * Get guide's assigned tours/slots
 * Params:
 *   - guideId: MongoDB ObjectId of the guide
 * Returns: Guide's assigned slots with passenger details
 * Auth: own GUIDE only (guides can only view their own assignments)
 */
router.get('/:guideId/assignments', requireRole('GUIDE'), getGuideAssignments);

export default router;
