import Receipt from '../models/Receipt.js';
import TimeSlot from '../models/TimeSlot.js';
import Guide from '../models/Guide.js';
import {
  validateUploadedFile,
  renameUploadedFile,
  cleanupFile,
  getFileMetadata,
  getAbsoluteFilePath
} from '../services/fileUploadService.js';
import fs from 'fs';
import { logger, ErrorCategory } from '../utils/errorLogger.js';
import { 
  FileUploadError, 
  ValidationError, 
  NotFoundError, 
  AuthorizationError,
  ConflictError,
  DatabaseError
} from '../utils/customErrors.js';

/**
 * POST /api/receipts/upload
 * Upload a receipt photo for a sub-slot
 * Body (multipart/form-data):
 *   - file: Receipt image (JPG/PNG, max 7MB)
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (e.g., "A", "B", "C") - optional for non-sub-slot products
 *   - notes: Optional notes from guide
 * Returns: Created receipt document
 * Auth: GUIDE (assigned only) or ADMIN
 */
export async function uploadReceipt(req, res, next) {
  let uploadedFile = null;
  let renamedFile = null;
  
  try {
    const { slotId, subSlotId, notes } = req.body;
    const file = req.file;
    
    // Validate required fields
    if (!slotId) {
      if (file) cleanupFile(file.path);
      throw new ValidationError('slotId is required');
    }
    
    if (!file) {
      throw new ValidationError('No file uploaded');
    }
    
    uploadedFile = file;
    
    // Validate file type and size
    try {
      validateUploadedFile(file);
    } catch (validationError) {
      cleanupFile(file.path);
      throw validationError;
    }
    
    // Verify time slot exists
    const timeSlot = await TimeSlot.findById(slotId);
    if (!timeSlot) {
      cleanupFile(file.path);
      throw new NotFoundError('Time slot');
    }
    
    // Get guide information from authenticated user
    let guide = await Guide.findOne({ userId: req.user.id });
    
    // For admins, find the assigned guide for the slot
    if (!guide && req.user.role === 'ADMIN') {
      if (timeSlot.requiresSubSlots && subSlotId) {
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === subSlotId);
        if (subSlot && subSlot.assignedGuideId) {
          guide = await Guide.findById(subSlot.assignedGuideId);
        }
      } else if (timeSlot.assignedGuideId) {
        guide = await Guide.findById(timeSlot.assignedGuideId);
      }
      
      if (!guide) {
        cleanupFile(file.path);
        throw new ValidationError('No guide assigned to this slot. Please assign a guide first.');
      }
    } else if (!guide) {
      cleanupFile(file.path);
      throw new NotFoundError('Guide profile');
    }
    
    // Authorization check: Guide can only upload for their assigned sub-slots
    // COORDINATOR and ADMIN can upload for any slot
    if (req.user.role === 'GUIDE') {
      if (timeSlot.requiresSubSlots && subSlotId) {
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === subSlotId);
        if (!subSlot) {
          cleanupFile(file.path);
          throw new NotFoundError('Sub-slot');
        }
        
        if (!subSlot.assignedGuideId || subSlot.assignedGuideId.toString() !== guide._id.toString()) {
          cleanupFile(file.path);
          throw new AuthorizationError('You are not assigned to this sub-slot');
        }
      } else {
        // Non-sub-slot product
        if (!timeSlot.assignedGuideId || timeSlot.assignedGuideId.toString() !== guide._id.toString()) {
          cleanupFile(file.path);
          throw new AuthorizationError('You are not assigned to this time slot');
        }
      }
    }
    
    // Check if receipt already exists for this slot/sub-slot
    const existingReceipt = await Receipt.findOne({ 
      slotId, 
      subSlotId: subSlotId || null 
    });
    
    if (existingReceipt) {
      cleanupFile(file.path);
      throw new ConflictError('A receipt has already been uploaded for this slot. Please delete the existing receipt first.');
    }
    
    // Rename file with proper naming convention (includes retry logic)
    try {
      renamedFile = renameUploadedFile(file, slotId, subSlotId || 'root');
      uploadedFile = renamedFile;
    } catch (renameError) {
      cleanupFile(file.path);
      throw renameError;
    }
    
    // Get file metadata
    const fileMetadata = getFileMetadata(renamedFile, slotId, subSlotId);
    
    // Create receipt document with retry logic for database errors
    let receipt;
    let dbRetries = 3;
    
    while (dbRetries > 0) {
      try {
        receipt = await Receipt.create({
          slotId,
          subSlotId: subSlotId || null,
          guideId: guide._id,
          guideName: guide.guideName,
          fileName: fileMetadata.fileName,
          fileSize: fileMetadata.fileSize,
          mimeType: fileMetadata.mimeType,
          fileUrl: fileMetadata.fileUrl,
          notes: notes || '',
          uploadedAt: new Date(),
          verificationStatus: 'PENDING'
        });
        break; // Success
      } catch (dbError) {
        dbRetries--;
        if (dbRetries === 0) {
          // Clean up file on database failure
          cleanupFile(renamedFile.path);
          throw new DatabaseError('Failed to create receipt record in database', dbError);
        }
        
        logger.warn(ErrorCategory.RECEIPT, 
          `Database error creating receipt, retrying... (${3 - dbRetries}/3)`,
          { error: dbError, slotId, subSlotId }
        );
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Update time slot with receipt reference
    try {
      if (timeSlot.requiresSubSlots && subSlotId) {
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === subSlotId);
        if (subSlot) {
          subSlot.receiptId = receipt._id;
          await timeSlot.save();
        }
      } else {
        timeSlot.receiptId = receipt._id;
        await timeSlot.save();
      }
    } catch (updateError) {
      // Log error but don't fail the request - receipt is already created
      logger.error(ErrorCategory.RECEIPT, 
        'Failed to update time slot with receipt reference',
        { error: updateError, receiptId: receipt._id, slotId }
      );
    }
    
    logger.info(ErrorCategory.RECEIPT, 'Receipt uploaded successfully', {
      receiptId: receipt._id,
      slotId,
      subSlotId,
      guideName: guide.guideName,
      fileSize: fileMetadata.fileSize
    });
    
    res.status(201).json({
      success: true,
      message: 'Receipt uploaded successfully',
      data: receipt
    });
    
  } catch (error) {
    logger.error(ErrorCategory.RECEIPT, 'Error uploading receipt', {
      error,
      slotId: req.body.slotId,
      subSlotId: req.body.subSlotId,
      userId: req.user?.id
    });
    
    // Clean up uploaded file on error
    if (uploadedFile && !renamedFile) {
      cleanupFile(uploadedFile.path);
    } else if (renamedFile) {
      cleanupFile(renamedFile.path);
    }
    
    next(error);
  }
}

/**
 * GET /api/receipts/:receiptId
 * Get receipt details by ID
 * Params:
 *   - receiptId: MongoDB ObjectId of the receipt
 * Returns: Receipt document
 * Auth: GUIDE (assigned only) or ADMIN
 */
export async function getReceiptById(req, res) {
  try {
    const { receiptId } = req.params;
    
    const receipt = await Receipt.findById(receiptId)
      .populate('slotId', 'productTitle startDateTime endDateTime')
      .populate('guideId', 'guideName email');
    
    if (!receipt) {
      return res.status(404).json({ 
        success: false, 
        message: 'Receipt not found' 
      });
    }
    
    // Authorization check: Guide can only view their own receipts
    // COORDINATOR and ADMIN can view any receipt
    if (req.user.role === 'GUIDE') {
      const guide = await Guide.findOne({ userId: req.user.id });
      if (!guide || receipt.guideId._id.toString() !== guide._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          message: 'You do not have permission to view this receipt' 
        });
      }
    }
    
    res.json({
      success: true,
      data: receipt
    });
    
  } catch (error) {
    console.error('❌ Error fetching receipt:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch receipt',
      error: error.message 
    });
  }
}

/**
 * GET /api/receipts/slot/:slotId/sub-slot/:subSlotId
 * Get receipt for a specific sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (e.g., "A", "B", "C")
 * Returns: Receipt document
 * Auth: GUIDE (assigned only) or ADMIN
 */
export async function getReceiptBySubSlot(req, res) {
  try {
    const { slotId, subSlotId } = req.params;
    
    // Verify time slot exists
    const timeSlot = await TimeSlot.findById(slotId);
    if (!timeSlot) {
      return res.status(404).json({ 
        success: false, 
        message: 'Time slot not found' 
      });
    }
    
    // Authorization check: Guide can only view receipts for their assigned sub-slots
    // COORDINATOR and ADMIN can view any receipt
    if (req.user.role === 'GUIDE') {
      const guide = await Guide.findOne({ userId: req.user.id });
      if (!guide) {
        return res.status(404).json({ 
          success: false, 
          message: 'Guide profile not found' 
        });
      }
      
      if (timeSlot.requiresSubSlots && subSlotId) {
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === subSlotId);
        if (!subSlot) {
          return res.status(404).json({ 
            success: false, 
            message: 'Sub-slot not found' 
          });
        }
        
        if (!subSlot.assignedGuideId || subSlot.assignedGuideId.toString() !== guide._id.toString()) {
          return res.status(403).json({ 
            success: false, 
            message: 'You are not assigned to this sub-slot' 
          });
        }
      } else {
        // Non-sub-slot product
        if (!timeSlot.assignedGuideId || timeSlot.assignedGuideId.toString() !== guide._id.toString()) {
          return res.status(403).json({ 
            success: false, 
            message: 'You are not assigned to this time slot' 
          });
        }
      }
    }
    
    // Find receipt
    const receipt = await Receipt.findOne({ 
      slotId, 
      subSlotId: subSlotId || null 
    })
      .populate('slotId', 'productTitle startDateTime endDateTime')
      .populate('guideId', 'guideName email');
    
    if (!receipt) {
      return res.status(404).json({ 
        success: false, 
        message: 'No receipt found for this sub-slot' 
      });
    }
    
    res.json({
      success: true,
      data: receipt
    });
    
  } catch (error) {
    console.error('❌ Error fetching receipt:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch receipt',
      error: error.message 
    });
  }
}

/**
 * GET /api/receipts/slot/:slotId
 * Get receipt for a time slot (non-sub-slot products)
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Receipt document
 * Auth: GUIDE (assigned only) or ADMIN
 */
export async function getReceiptBySlot(req, res) {
  try {
    const { slotId } = req.params;
    
    // Verify time slot exists
    const timeSlot = await TimeSlot.findById(slotId);
    if (!timeSlot) {
      return res.status(404).json({ 
        success: false, 
        message: 'Time slot not found' 
      });
    }
    
    // Authorization check: Guide can only view receipts for their assigned slots
    // COORDINATOR and ADMIN can view any receipt
    if (req.user.role === 'GUIDE') {
      const guide = await Guide.findOne({ userId: req.user.id });
      if (!guide) {
        return res.status(404).json({ 
          success: false, 
          message: 'Guide profile not found' 
        });
      }
      
      if (!timeSlot.assignedGuideId || timeSlot.assignedGuideId.toString() !== guide._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          message: 'You are not assigned to this time slot' 
        });
      }
    }
    
    // Find receipt (subSlotId should be null for non-sub-slot products)
    const receipt = await Receipt.findOne({ 
      slotId, 
      subSlotId: null 
    })
      .populate('slotId', 'productTitle startDateTime endDateTime')
      .populate('guideId', 'guideName email');
    
    if (!receipt) {
      return res.status(404).json({ 
        success: false, 
        message: 'No receipt found for this time slot' 
      });
    }
    
    res.json({
      success: true,
      data: receipt
    });
    
  } catch (error) {
    console.error('❌ Error fetching receipt:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch receipt',
      error: error.message 
    });
  }
}

/**
 * GET /api/receipts/image/:receiptId
 * Serve receipt image file
 * Params:
 *   - receiptId: MongoDB ObjectId of the receipt
 * Returns: Image file
 * Auth: GUIDE (assigned only) or ADMIN
 */
export async function serveReceiptImage(req, res) {
  try {
    const { receiptId } = req.params;
    
    const receipt = await Receipt.findById(receiptId);
    
    if (!receipt) {
      return res.status(404).json({ 
        success: false, 
        message: 'Receipt not found' 
      });
    }
    
    // Authorization check: Guide can only view their own receipts
    // COORDINATOR and ADMIN can view any receipt
    if (req.user.role === 'GUIDE') {
      const guide = await Guide.findOne({ userId: req.user.id });
      if (!guide || receipt.guideId.toString() !== guide._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          message: 'You do not have permission to view this receipt' 
        });
      }
    }
    
    // Get absolute file path
    const filePath = getAbsoluteFilePath(receipt.fileUrl);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Receipt image file not found' 
      });
    }
    
    // Set appropriate content type
    res.setHeader('Content-Type', receipt.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${receipt.fileName}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('❌ Error serving receipt image:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to serve receipt image',
      error: error.message 
    });
  }
}
