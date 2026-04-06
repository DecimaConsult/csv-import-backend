import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logger, ErrorCategory } from '../utils/errorLogger.js';
import { FileUploadError } from '../utils/customErrors.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base uploads directory
const UPLOADS_BASE_DIR = path.join(__dirname, '../../uploads');

/**
 * Ensure uploads directory structure exists
 * Creates: uploads/receipts/YYYY/MM/DD/ and uploads/tickets/
 */
export function ensureUploadDirectories() {
  const receiptsDir = path.join(UPLOADS_BASE_DIR, 'receipts');
  const ticketsDir = path.join(UPLOADS_BASE_DIR, 'tickets');
  
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
    console.log(`✅ Created uploads directory: ${receiptsDir}`);
  }
  
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
    console.log(`✅ Created uploads directory: ${ticketsDir}`);
  }
}

/**
 * Get date-based directory path for organizing uploads
 * Format: YYYY/MM/DD
 */
function getDateBasedPath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return path.join(year.toString(), month, day);
}

/**
 * Generate unique filename to prevent collisions
 * Format: {slotId}_{subSlotId}_{timestamp}_{random}.{ext}
 */
function generateUniqueFilename(slotId, subSlotId, originalFilename) {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalFilename).toLowerCase();
  const subSlotPart = subSlotId ? `_${subSlotId}` : '';
  
  return `${slotId}${subSlotPart}_${timestamp}_${randomString}${ext}`;
}

/**
 * Validate file type using magic numbers (file signature)
 * More secure than just checking extension
 */
function validateFileType(buffer, mimetype) {
  const allowedMimeTypes = ['image/jpeg', 'image/png'];
  
  if (!allowedMimeTypes.includes(mimetype)) {
    logger.warn(ErrorCategory.FILE_UPLOAD, 'Invalid file type attempted', { mimetype });
    throw new FileUploadError('Only JPG and PNG files are allowed');
  }
  
  // Check magic numbers (file signatures)
  const magicNumbers = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47]
  };
  
  const isJPEG = buffer[0] === magicNumbers.jpeg[0] && 
                 buffer[1] === magicNumbers.jpeg[1] && 
                 buffer[2] === magicNumbers.jpeg[2];
  
  const isPNG = buffer[0] === magicNumbers.png[0] && 
                buffer[1] === magicNumbers.png[1] && 
                buffer[2] === magicNumbers.png[2] && 
                buffer[3] === magicNumbers.png[3];
  
  if (!isJPEG && !isPNG) {
    logger.warn(ErrorCategory.FILE_UPLOAD, 'File signature mismatch', { mimetype });
    throw new FileUploadError('Invalid file format. File does not match JPG or PNG signature.');
  }
  
  return true;
}

/**
 * Validate file size
 * Maximum: 7MB
 */
function validateFileSize(size) {
  const maxSizeBytes = 7 * 1024 * 1024; // 7MB
  
  if (size > maxSizeBytes) {
    logger.warn(ErrorCategory.FILE_UPLOAD, 'File size exceeds limit', { 
      size, 
      maxSize: maxSizeBytes,
      sizeMB: (size / 1024 / 1024).toFixed(2)
    });
    throw new FileUploadError('File size must not exceed 7MB');
  }
  
  return true;
}

/**
 * Configure multer storage
 * Stores files in date-based directory structure
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const dateBasedPath = getDateBasedPath();
      const fullPath = path.join(UPLOADS_BASE_DIR, 'receipts', dateBasedPath);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
      
      cb(null, fullPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    try {
      // Generate a temporary unique filename
      // We'll validate slotId later in the controller
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase();
      const tempFilename = `temp_${timestamp}_${randomString}${ext}`;
      
      cb(null, tempFilename);
    } catch (error) {
      cb(error);
    }
  }
});

/**
 * File filter for multer
 * Validates file type and size before upload
 */
const fileFilter = (req, file, cb) => {
  try {
    // Validate mime type
    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPG and PNG files are allowed'), false);
    }
    
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

/**
 * Configure multer middleware for tickets (PDF files)
 */
const ticketStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const ticketsPath = path.join(UPLOADS_BASE_DIR, 'tickets');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(ticketsPath)) {
        fs.mkdirSync(ticketsPath, { recursive: true });
      }
      
      cb(null, ticketsPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    try {
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase();
      const tempFilename = `ticket_${timestamp}_${randomString}${ext}`;
      
      cb(null, tempFilename);
    } catch (error) {
      cb(error);
    }
  }
});

const ticketFileFilter = (req, file, cb) => {
  try {
    // Allow PDF files for tickets
    const allowedMimeTypes = ['application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF files are allowed for tickets'), false);
    }
    
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

export const ticketUploadMiddleware = multer({
  storage: ticketStorage,
  fileFilter: ticketFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for PDF files
    files: 1
  }
});

/**
 * Configure multer middleware
 */
export const uploadMiddleware = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 7 * 1024 * 1024, // 7MB
    files: 1 // Only one file at a time
  }
});

/**
 * Validate uploaded file
 * Performs additional validation after multer processes the file
 */
export function validateUploadedFile(file) {
  if (!file) {
    throw new FileUploadError('No file uploaded');
  }
  
  try {
    // Validate file exists
    if (!fs.existsSync(file.path)) {
      throw new FileUploadError('Uploaded file not found on server');
    }
    
    // Read first few bytes to validate file signature
    const buffer = fs.readFileSync(file.path);
    
    // Validate buffer is not empty
    if (buffer.length === 0) {
      throw new FileUploadError('Uploaded file is empty');
    }
    
    validateFileType(buffer, file.mimetype);
    validateFileSize(file.size);
    
    logger.info(ErrorCategory.FILE_UPLOAD, 'File validation successful', {
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    });
    
    return true;
  } catch (error) {
    // Clean up invalid file
    cleanupFile(file.path);
    
    // Re-throw as FileUploadError if not already
    if (error instanceof FileUploadError) {
      throw error;
    }
    
    logger.error(ErrorCategory.FILE_UPLOAD, 'File validation failed', { 
      error, 
      filename: file?.originalname 
    });
    throw new FileUploadError(`File validation failed: ${error.message}`);
  }
}

/**
 * Clean up uploaded file
 * Used when an error occurs after file upload
 */
export function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(ErrorCategory.FILE_UPLOAD, 'Cleaned up file', { filePath });
      return true;
    }
    return false;
  } catch (error) {
    logger.error(ErrorCategory.FILE_UPLOAD, 'Error cleaning up file', { 
      error, 
      filePath 
    });
    return false;
  }
}

/**
 * Rename uploaded file with proper naming convention
 * Should be called after validation
 * Includes retry logic for transient filesystem errors
 */
export function renameUploadedFile(file, slotId, subSlotId, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const oldPath = file.path;
      
      // Validate old file exists
      if (!fs.existsSync(oldPath)) {
        throw new FileUploadError('Source file not found for rename operation');
      }
      
      const dir = path.dirname(oldPath);
      const newFilename = generateUniqueFilename(slotId, subSlotId, file.originalname);
      const newPath = path.join(dir, newFilename);
      
      // Check if destination already exists (collision)
      if (fs.existsSync(newPath)) {
        logger.warn(ErrorCategory.FILE_UPLOAD, 'Destination file already exists, regenerating filename', {
          newPath,
          attempt
        });
        // Wait a bit and retry with new timestamp
        if (attempt < maxRetries) {
          const delay = 50 * attempt;
          const start = Date.now();
          while (Date.now() - start < delay) {
            // Busy wait
          }
          continue;
        }
        throw new FileUploadError('Failed to generate unique filename after multiple attempts');
      }
      
      fs.renameSync(oldPath, newPath);
      
      // Verify rename was successful
      if (!fs.existsSync(newPath)) {
        throw new FileUploadError('File rename verification failed - destination file not found');
      }
      
      logger.info(ErrorCategory.FILE_UPLOAD, 'File renamed successfully', {
        oldFilename: file.filename,
        newFilename,
        slotId,
        subSlotId,
        attempt
      });
      
      return {
        ...file,
        filename: newFilename,
        path: newPath
      };
    } catch (error) {
      lastError = error;
      
      // Check if this is a transient error that can be retried
      const isTransientError = error.code === 'EBUSY' || 
                              error.code === 'EPERM' || 
                              error.code === 'EACCES';
      
      if (isTransientError && attempt < maxRetries) {
        logger.warn(ErrorCategory.FILE_UPLOAD, 
          `Transient error renaming file, retrying... (attempt ${attempt}/${maxRetries})`,
          { error, attempt, maxRetries }
        );
        
        // Wait before retrying (exponential backoff)
        const delay = 100 * attempt;
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait
        }
        continue;
      }
      
      // Non-transient error or max retries reached
      logger.error(ErrorCategory.FILE_UPLOAD, 'Error renaming file', { 
        error, 
        oldPath: file.path,
        attempt
      });
      
      // Clean up original file on failure
      cleanupFile(file.path);
      
      if (error instanceof FileUploadError) {
        throw error;
      }
      throw new FileUploadError(`Failed to rename uploaded file: ${error.message}`);
    }
  }
  
  // If we get here, all retries failed
  logger.error(ErrorCategory.FILE_UPLOAD, 
    'Failed to rename file after maximum retries',
    { error: lastError, maxRetries }
  );
  
  cleanupFile(file.path);
  throw new FileUploadError('Failed to rename uploaded file after maximum retries');
}

/**
 * Get file metadata for database storage
 */
export function getFileMetadata(file, slotId, subSlotId) {
  const dateBasedPath = getDateBasedPath();
  const relativePath = path.join('receipts', dateBasedPath, file.filename);
  
  return {
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    fileUrl: `/uploads/${relativePath}`, // URL path for serving the file
    filePath: file.path // Absolute path for file operations
  };
}

/**
 * Delete file from filesystem
 * Used when deleting a receipt from database
 */
export function deleteFile(fileUrl) {
  try {
    // Convert URL path to filesystem path
    const relativePath = fileUrl.replace('/uploads/', '');
    const fullPath = path.join(UPLOADS_BASE_DIR, relativePath);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️  Deleted file: ${fullPath}`);
      return true;
    }
    
    console.warn(`⚠️  File not found: ${fullPath}`);
    return false;
  } catch (error) {
    console.error(`❌ Error deleting file:`, error.message);
    throw error;
  }
}

/**
 * Get absolute file path from URL
 */
export function getAbsoluteFilePath(fileUrl) {
  const relativePath = fileUrl.replace('/uploads/', '');
  return path.join(UPLOADS_BASE_DIR, relativePath);
}

// Initialize upload directories on module load
ensureUploadDirectories();

export default {
  uploadMiddleware,
  validateUploadedFile,
  renameUploadedFile,
  cleanupFile,
  getFileMetadata,
  deleteFile,
  getAbsoluteFilePath,
  ensureUploadDirectories
};
