import express from 'express';
import { getAllUsers, disableUser, enableUser, deleteUser } from '../controllers/userController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all users (guides and coordinators)
router.get('/', requireRole('ADMIN'), getAllUsers);

// Disable a user
router.post('/:userId/disable', requireRole('ADMIN'), disableUser);

// Enable a user
router.post('/:userId/enable', requireRole('ADMIN'), enableUser);

// Delete a user permanently (requires PIN)
router.delete('/:userId', requireRole('ADMIN'), deleteUser);

export default router;
