import { verifyToken } from '../services/authService.js';
import User from '../models/User.js';

/**
 * Middleware to verify JWT token and attach user info to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ 
        error: 'No authorization header provided' 
      });
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Invalid authorization header format. Expected: Bearer <token>' 
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided' 
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Fetch user from database to ensure user still exists
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ 
        error: 'User not found' 
      });
    }

    // Check if account is disabled
    if (!user.isActive) {
      return res.status(403).json({
        error: 'Your account has been disabled. Please contact an administrator.',
        disabled: true
      });
    }

    // Attach user info to request
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.message === 'Token has expired') {
      return res.status(401).json({ 
        error: 'Token has expired' 
      });
    }
    if (error.message === 'Invalid token') {
      return res.status(401).json({ 
        error: 'Invalid token' 
      });
    }
    return res.status(401).json({ 
      error: 'Authentication failed' 
    });
  }
};

/**
 * Middleware to check if user has required role(s)
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 * @returns {Function} Express middleware function
 */
export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Ensure user is authenticated first
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    // Convert single role to array for consistent handling
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    console.log(`🔐 Role check: User role="${req.user.role}", Allowed roles=[${roles.join(', ')}], Path=${req.path}`);

    // Check if user's role is in allowed roles
    if (!roles.includes(req.user.role)) {
      console.log(`❌ Role check FAILED for ${req.path}`);
      return res.status(403).json({ 
        error: 'Insufficient permissions. Required role: ' + roles.join(' or ') 
      });
    }

    console.log(`✅ Role check PASSED for ${req.path}`);
    next();
  };
};

/**
 * Combined middleware for authentication and role checking
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 * @returns {Function[]} Array of middleware functions
 */
export const requireRole = (allowedRoles) => {
  return [authenticate, checkRole(allowedRoles)];
};

export default {
  authenticate,
  checkRole,
  requireRole
};
