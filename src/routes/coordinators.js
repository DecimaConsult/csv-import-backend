import express from 'express';
import { createCoordinator, getCoordinators, updateCoordinatorProducts, setupPassword } from '../controllers/coordinatorController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/coordinators/setup-password
 * Setup password using token (no auth required)
 */
router.post('/setup-password', setupPassword);

/**
 * POST /api/coordinators
 * Create new coordinator (ADMIN only)
 */
router.post('/', requireRole('ADMIN'), createCoordinator);

/**
 * GET /api/coordinators
 * Get all coordinators (ADMIN only)
 */
router.get('/', requireRole('ADMIN'), getCoordinators);

/**
 * PUT /api/coordinators/:coordinatorId/products
 * Update coordinator product assignments (ADMIN only)
 */
router.put('/:coordinatorId/products', requireRole('ADMIN'), updateCoordinatorProducts);

export default router;
