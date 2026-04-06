import User from '../models/User.js';
import Guide from '../models/Guide.js';
import Coordinator from '../models/Coordinator.js';

/**
 * Get all guides and coordinators
 */
export const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    
    const query = {
      role: { $in: ['GUIDE', 'COORDINATOR'] }
    };
    
    if (role && ['GUIDE', 'COORDINATOR'].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('disabledBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with profile data
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        if (user.role === 'GUIDE') {
          const guide = await Guide.findOne({ userId: user._id })
            .select('firstName lastName phoneNumber')
            .lean();
          return { ...user, profile: guide };
        } else if (user.role === 'COORDINATOR') {
          const coordinator = await Coordinator.findOne({ userId: user._id })
            .select('name email')
            .lean();
          return { ...user, profile: coordinator };
        }
        return user;
      })
    );

    res.json({
      success: true,
      count: enrichedUsers.length,
      data: enrichedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
};

/**
 * Disable a user account
 */
export const disableUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body || {};
    const adminId = req.user.id;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent disabling admin accounts
    if (user.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Cannot disable admin accounts'
      });
    }

    // Prevent disabling self
    if (user._id.toString() === adminId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Cannot disable your own account'
      });
    }

    // Check if already disabled
    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        error: 'User is already disabled'
      });
    }

    // Disable the user
    user.isActive = false;
    user.disabledAt = new Date();
    user.disabledBy = adminId;
    user.disableReason = reason || null;
    await user.save();

    console.log(`🚫 User disabled: ${user.email} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'User disabled successfully',
      data: {
        userId: user._id,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        disabledAt: user.disabledAt
      }
    });
  } catch (error) {
    console.error('Error disabling user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable user'
    });
  }
};

/**
 * Enable a user account
 */
export const enableUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is disabled
    if (user.isActive) {
      return res.status(400).json({
        success: false,
        error: 'User is not disabled'
      });
    }

    // Enable the user
    user.isActive = true;
    user.disabledAt = null;
    user.disabledBy = null;
    user.disableReason = null;
    await user.save();

    console.log(`✅ User enabled: ${user.email} by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'User enabled successfully',
      data: {
        userId: user._id,
        email: user.email,
        name: user.name,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Error enabling user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable user'
    });
  }
};

/**
 * Delete a user account permanently (requires PIN verification)
 */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { pin } = req.body;
    const adminId = req.user.id;

    // Verify PIN
    const IMPORT_PIN = process.env.IMPORT_PIN;
    if (!pin || pin !== IMPORT_PIN) {
      return res.status(403).json({
        success: false,
        error: 'Invalid PIN'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deleting admin accounts
    if (user.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete admin accounts'
      });
    }

    // Prevent deleting self
    if (user._id.toString() === adminId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const userEmail = user.email;
    const userName = user.name;
    const userRole = user.role;

    // Delete associated profile data
    if (user.role === 'GUIDE') {
      await Guide.deleteOne({ userId: user._id });
      console.log(`🗑️  Deleted Guide profile for ${userEmail}`);
    } else if (user.role === 'COORDINATOR') {
      await Coordinator.deleteOne({ userId: user._id });
      console.log(`🗑️  Deleted Coordinator profile for ${userEmail}`);
    }

    // Delete the user account
    await User.deleteOne({ _id: user._id });

    console.log(`🗑️  User permanently deleted: ${userEmail} (${userRole}) by admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'User deleted permanently',
      data: {
        email: userEmail,
        name: userName,
        role: userRole
      }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
};

export default {
  getAllUsers,
  disableUser,
  enableUser,
  deleteUser
};
