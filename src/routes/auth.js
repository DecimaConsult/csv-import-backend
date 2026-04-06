import express from 'express';
import { login, me, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 * Body: { email, password }
 * Returns: { token, user: { id, email, name, role } }
 */
router.post('/login', login);

/**
 * GET /api/auth/me
 * Get current authenticated user info
 * Headers: Authorization: Bearer <token>
 * Returns: { user: { id, email, name, role } }
 */
router.get('/me', authenticate, me);

/**
 * POST /api/auth/forgot-password
 * Request password reset email (public endpoint)
 * Body: { email }
 * Returns: { success, message }
 */
router.post('/forgot-password', forgotPassword);

/**
 * POST /api/auth/reset-password
 * Reset password using token (public endpoint)
 * Body: { token, password }
 * Returns: { success, message }
 */
router.post('/reset-password', resetPassword);

export default router;
