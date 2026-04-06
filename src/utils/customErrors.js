/**
 * Custom Error Classes
 * Provides specific error types for better error handling and user feedback
 */

/**
 * Base custom error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * File upload error (400)
 */
export class FileUploadError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'FileUploadError';
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * Sub-slot creation error (500)
 */
export class SubSlotError extends AppError {
  constructor(message) {
    super(message, 500);
    this.name = 'SubSlotError';
  }
}

/**
 * Check-in error (400)
 */
export class CheckInError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'CheckInError';
  }
}

/**
 * Webhook processing error (500)
 */
export class WebhookError extends AppError {
  constructor(message) {
    super(message, 500);
    this.name = 'WebhookError';
  }
}

/**
 * Network/External service error (503)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export default AppError;
