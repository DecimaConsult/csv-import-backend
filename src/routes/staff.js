import express from 'express';
import { createStaff, getStaff, setupPassword } from '../controllers/staffController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Password setup (no auth required - uses token)
router.post('/setup-password', setupPassword);

// All other staff routes require ADMIN role
router.post('/', requireRole('ADMIN'), createStaff);
router.get('/', requireRole('ADMIN'), getStaff);

export default router;
