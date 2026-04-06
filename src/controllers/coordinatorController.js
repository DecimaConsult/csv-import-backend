import User from '../models/User.js';
import Coordinator from '../models/Coordinator.js';
import PasswordSetupToken from '../models/PasswordSetupToken.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import emailService from '../services/emailService.js';

/**
 * Create a new coordinator with password setup email
 */
export const createCoordinator = async (req, res) => {
  try {
    const { name, email, assignedProducts = [] } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'A user with this email already exists'
      });
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create user account
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'COORDINATOR',
      name
    });

    // Remove duplicates from assignedProducts
    const uniqueProducts = [...new Set(assignedProducts || [])];

    // Create coordinator profile
    const coordinator = await Coordinator.create({
      userId: user._id,
      name,
      email: email.toLowerCase(),
      assignedProducts: uniqueProducts
    });

    // Generate password setup token
    const setupToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    await PasswordSetupToken.create({
      userId: user._id,
      token: setupToken,
      expiresAt: tokenExpiry
    });

    // Send password setup email
    const emailResult = await emailService.sendPasswordSetupEmail(
      email,
      name,
      setupToken,
      'COORDINATOR'
    );

    res.status(201).json({
      success: true,
      data: {
        coordinator: {
          _id: coordinator._id,
          userId: user._id,
          name: coordinator.name,
          email: coordinator.email,
          role: user.role,
          assignedProducts: coordinator.assignedProducts
        },
        emailSent: emailResult.success
      },
      message: emailResult.success 
        ? 'Coordinator created successfully. Password setup email sent.'
        : 'Coordinator created successfully. Email sending failed.'
    });
  } catch (error) {
    console.error('Error creating coordinator:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create coordinator'
    });
  }
};

/**
 * Get all coordinators
 */
export const getCoordinators = async (req, res) => {
  try {
    const coordinators = await Coordinator.find()
      .populate('userId', 'email role createdAt isActive')
      .sort({ createdAt: -1 })
      .lean();

    // Deduplicate assignedProducts for each coordinator
    const cleanedCoordinators = coordinators.map(coord => ({
      ...coord,
      assignedProducts: [...new Set(coord.assignedProducts || [])]
    }));

    res.json({
      success: true,
      data: cleanedCoordinators
    });
  } catch (error) {
    console.error('Error fetching coordinators:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coordinators'
    });
  }
};

/**
 * Update coordinator product assignments
 */
export const updateCoordinatorProducts = async (req, res) => {
  try {
    const { coordinatorId } = req.params;
    const { assignedProducts } = req.body;

    if (!Array.isArray(assignedProducts)) {
      return res.status(400).json({
        success: false,
        error: 'assignedProducts must be an array'
      });
    }

    // Remove duplicates using Set
    const uniqueProducts = [...new Set(assignedProducts)];

    const coordinator = await Coordinator.findByIdAndUpdate(
      coordinatorId,
      { assignedProducts: uniqueProducts },
      { new: true }
    );

    if (!coordinator) {
      return res.status(404).json({
        success: false,
        error: 'Coordinator not found'
      });
    }

    res.json({
      success: true,
      data: coordinator,
      message: 'Product assignments updated successfully'
    });
  } catch (error) {
    console.error('Error updating coordinator products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update coordinator products'
    });
  }
};

/**
 * Setup password using token from email
 * POST /api/coordinators/setup-password
 * Body: { token, password }
 */
export const setupPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Find valid token
    const setupToken = await PasswordSetupToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: Date.now() }
    });

    if (!setupToken) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    await User.findByIdAndUpdate(setupToken.userId, {
      password: hashedPassword
    });

    // Mark token as used
    setupToken.used = true;
    await setupToken.save();

    res.status(200).json({
      success: true,
      message: 'Password set successfully. You can now log in.'
    });
  } catch (error) {
    console.error('Error setting up password:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set up password'
    });
  }
};

export default {
  createCoordinator,
  getCoordinators,
  updateCoordinatorProducts,
  setupPassword
};
