/**
 * Error Handler Middleware
 * Centralized error handling for the Express application
 */

import { logger, ErrorCategory, getRequestContext } from '../utils/errorLogger.js';
import AppError from '../utils/customErrors.js';

const errorHandler = (err, req, res, next) => {
  // Determine error category
  let category = ErrorCategory.UNKNOWN;
  
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    category = ErrorCategory.VALIDATION;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || 
             err.name === 'AuthenticationError') {
    category = ErrorCategory.AUTHENTICATION;
  } else if (err.name === 'AuthorizationError' || err.name === 'ForbiddenError') {
    category = ErrorCategory.AUTHORIZATION;
  } else if (err.name === 'FileUploadError') {
    category = ErrorCategory.FILE_UPLOAD;
  } else if (err.name === 'SubSlotError') {
    category = ErrorCategory.SUB_SLOT;
  } else if (err.name === 'CheckInError') {
    category = ErrorCategory.CHECK_IN;
  } else if (err.name === 'WebhookError') {
    category = ErrorCategory.WEBHOOK;
  } else if (err.name === 'DatabaseError' || err.name === 'MongoError') {
    category = ErrorCategory.DATABASE;
  }
  
  // Log error with context
  logger.error(category, err.message, {
    error: err,
    request: getRequestContext(req),
    statusCode: err.statusCode || 500
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: errors.join(', '),
      details: errors
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID',
      message: `Invalid ${err.path}: ${err.value}`
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      error: 'Duplicate Entry',
      message: `${field} already exists`
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Token expired'
    });
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds the maximum limit of 7MB';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
    
    return res.status(400).json({
      success: false,
      error: 'File Upload Error',
      message
    });
  }

  // Custom app errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.name,
      message: err.message,
      ...(err.details && { details: err.details })
    });
  }

  // Custom authorization error (legacy)
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: err.message || 'Authentication required'
    });
  }

  // Custom forbidden error (legacy)
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: err.message || 'Access denied'
    });
  }

  // Custom not found error (legacy)
  if (err.name === 'NotFoundError') {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: err.message || 'Resource not found'
    });
  }

  // Custom bad request error (legacy)
  if (err.name === 'BadRequestError') {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: err.message || 'Invalid request'
    });
  }

  // Default to 500 server error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Something went wrong on the server',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);
  error.name = 'NotFoundError';
  error.statusCode = 404;
  next(error);
};

export { errorHandler, notFoundHandler };
