/**
 * Error Logging and Monitoring Utility
 * Provides structured error logging with context and severity levels
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// Error categories for better monitoring
export const ErrorCategory = {
  DATABASE: 'DATABASE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  VALIDATION: 'VALIDATION',
  WEBHOOK: 'WEBHOOK',
  SUB_SLOT: 'SUB_SLOT',
  CHECK_IN: 'CHECK_IN',
  RECEIPT: 'RECEIPT',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Structured error logger
 * @param {String} level - Log level (ERROR, WARN, INFO, DEBUG)
 * @param {String} category - Error category
 * @param {String} message - Error message
 * @param {Object} context - Additional context (error object, request info, etc.)
 */
export function logError(level, category, message, context = {}) {
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    level,
    category,
    message,
    ...context,
    // Include stack trace for errors
    ...(context.error && {
      errorName: context.error.name,
      errorMessage: context.error.message,
      stack: process.env.NODE_ENV === 'development' ? context.error.stack : undefined
    })
  };
  
  // Console output with color coding
  const colorCode = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[36m',  // Cyan
    DEBUG: '\x1b[90m'  // Gray
  };
  
  const resetColor = '\x1b[0m';
  const color = colorCode[level] || resetColor;
  
  console.log(`${color}[${timestamp}] [${level}] [${category}] ${message}${resetColor}`);
  
  if (context.error) {
    console.error(color + context.error.stack + resetColor);
  }
  
  // In production, you would send this to a monitoring service
  // e.g., Sentry, DataDog, CloudWatch, etc.
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with monitoring service
    // sendToMonitoringService(logEntry);
  }
  
  // Write to log file for persistent storage
  if (level === LogLevel.ERROR || level === LogLevel.WARN) {
    writeToLogFile(logEntry);
  }
}

/**
 * Write log entry to file
 * @param {Object} logEntry - Structured log entry
 */
function writeToLogFile(logEntry) {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create log file name based on date
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `${date}.log`);
    
    // Append log entry to file
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    // Don't throw error if logging fails
    console.error('Failed to write to log file:', error.message);
  }
}

/**
 * Helper functions for specific log levels
 */
export const logger = {
  error: (category, message, context) => logError(LogLevel.ERROR, category, message, context),
  warn: (category, message, context) => logError(LogLevel.WARN, category, message, context),
  info: (category, message, context) => logError(LogLevel.INFO, category, message, context),
  debug: (category, message, context) => logError(LogLevel.DEBUG, category, message, context)
};

/**
 * Create error context from Express request
 * @param {Object} req - Express request object
 * @returns {Object} Request context
 */
export function getRequestContext(req) {
  return {
    method: req.method,
    path: req.path,
    query: req.query,
    params: req.params,
    userId: req.user?.id,
    userRole: req.user?.role,
    ip: req.ip,
    userAgent: req.get('user-agent')
  };
}

export default logger;
