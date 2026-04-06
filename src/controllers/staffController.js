import User from '../models/User.js';
import PasswordSetupToken from '../models/PasswordSetupToken.js';
import emailService from '../services/emailService.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Create a new staff member with email invitation
 */
export const createStaff = async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Generate temporary password (will be replaced when staff sets up account)
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create staff user
    const staff = new User({
      email: email.toLowerCase(),
      name,
      password: hashedPassword,
      role: 'STAFF',
      isActive: true
    });

    await staff.save();

    // Generate password setup token
    const setupToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    await PasswordSetupToken.create({
      userId: staff._id,
      token: setupToken,
      expiresAt: tokenExpiry
    });

    // Send password setup email
    const emailResult = await emailService.sendPasswordSetupEmail(
      email,
      name,
      setupToken,
      'STAFF'
    );

    res.status(201).json({
      message: emailResult.success 
        ? 'Staff member created successfully. Password setup email sent.'
        : 'Staff member created successfully. Email sending failed.',
      staff: {
        id: staff._id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        isActive: staff.isActive
      },
      emailSent: emailResult.success
    });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({ error: 'Failed to create staff member' });
  }
};

/**
 * Get all staff members
 */
export const getStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: 'STAFF' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ staff });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff members' });
  }
};

/**
 * Setup password using token from email
 * POST /api/staff/setup-password
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
