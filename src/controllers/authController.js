import { login as authLogin } from '../services/authService.js';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import emailService from '../services/emailService.js';

/**
 * Handle user login
 * POST /api/auth/login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Authenticate user
    const result = await authLogin(email, password);

    // Return token and user info
    res.status(200).json(result);
  } catch (error) {
    // Handle disabled account
    if (error.disabled) {
      return res.status(403).json({
        error: error.message,
        disabled: true
      });
    }

    // Handle authentication errors
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({ 
        error: error.message 
      });
    }

    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error during login' 
    });
  }
};

/**
 * Get current user info from token
 * GET /api/auth/me
 * @param {Object} req - Express request object (with user attached by auth middleware)
 * @param {Object} res - Express response object
 */
export const me = async (req, res) => {
  try {
    // User info is already attached to req by authenticate middleware
    if (!req.user) {
      return res.status(401).json({ 
        error: 'User not authenticated' 
      });
    }

    // Return current user info
    res.status(200).json({ 
      user: req.user 
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
};

/**
 * Request password reset
 * POST /api/auth/forgot-password
 * Body: { email }
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Don't reveal if email exists (security best practice)
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If that email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    // Store token
    await PasswordResetToken.create({
      userId: user._id,
      token: resetToken,
      expiresAt: tokenExpiry
    });

    // Send email
    const emailResult = await emailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetToken
    );

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
    }

    res.status(200).json({
      success: true,
      message: 'If that email exists, a password reset link has been sent',
      emailSent: emailResult.success
    });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({
      error: 'Failed to process password reset request'
    });
  }
};

/**
 * Reset password using token
 * POST /api/auth/reset-password
 * Body: { token, password }
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: 'Token and password are required'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long'
      });
    }

    // Find valid token
    const resetToken = await PasswordResetToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: Date.now() }
    });

    if (!resetToken) {
      return res.status(400).json({
        error: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    await User.findByIdAndUpdate(resetToken.userId, {
      password: hashedPassword
    });

    // Mark token as used
    resetToken.used = true;
    await resetToken.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      error: 'Failed to reset password'
    });
  }
};

export default {
  login,
  me,
  forgotPassword,
  resetPassword
};
