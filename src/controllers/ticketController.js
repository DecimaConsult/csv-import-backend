import TimeSlot from '../models/TimeSlot.js';
import Product from '../models/Product.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Upload ticket file for a slot or sub-slot
 */
export const uploadTicket = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    if (!slotId) {
      return res.status(400).json({ success: false, error: 'slotId is required' });
    }

    // Find the slot
    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }

    // Check if product requires tickets (convert productId to string for lookup)
    const product = await Product.findOne({ productId: String(slot.productId) });
    if (!product || !product.requiresTickets) {
      // Clean up uploaded file
      try {
        await fs.unlink(file.path);
      } catch (err) {
        console.error('Error deleting uploaded file:', err);
      }
      return res.status(400).json({ 
        success: false, 
        error: 'This product does not require tickets' 
      });
    }

    // Prepare ticket file data
    const ticketFileData = {
      fileName: file.filename,
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileUrl: `/uploads/tickets/${file.filename}`,
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    };

    // Update slot or sub-slot with ticket file
    if (subSlotId) {
      // Update sub-slot
      const subSlotIndex = slot.subSlots.findIndex(ss => ss.subSlotId === subSlotId);
      if (subSlotIndex === -1) {
        // Clean up uploaded file
        try {
          await fs.unlink(file.path);
        } catch (err) {
          console.error('Error deleting uploaded file:', err);
        }
        return res.status(404).json({ success: false, error: 'Sub-slot not found' });
      }

      // Delete old ticket file if exists
      if (slot.subSlots[subSlotIndex].ticketFile?.fileName) {
        const oldFilePath = path.join(__dirname, '../../uploads/tickets', slot.subSlots[subSlotIndex].ticketFile.fileName);
        try {
          await fs.unlink(oldFilePath);
        } catch (err) {
          console.error('Error deleting old ticket file:', err);
        }
      }

      slot.subSlots[subSlotIndex].ticketFile = ticketFileData;
      await slot.save();

      return res.status(200).json({
        success: true,
        message: 'Ticket uploaded successfully',
        data: {
          slotId: slot._id,
          subSlotId,
          ticketFile: ticketFileData
        }
      });
    } else {
      // Update root-level slot
      // Delete old ticket file if exists
      if (slot.ticketFile?.fileName) {
        const oldFilePath = path.join(__dirname, '../../uploads/tickets', slot.ticketFile.fileName);
        try {
          await fs.unlink(oldFilePath);
        } catch (err) {
          console.error('Error deleting old ticket file:', err);
        }
      }

      slot.ticketFile = ticketFileData;
      await slot.save();

      return res.status(200).json({
        success: true,
        message: 'Ticket uploaded successfully',
        data: {
          slotId: slot._id,
          ticketFile: ticketFileData
        }
      });
    }
  } catch (error) {
    console.error('Error uploading ticket:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Error deleting uploaded file:', err);
      }
    }
    
    res.status(500).json({ success: false, error: 'Failed to upload ticket' });
  }
};

/**
 * Get ticket file info for a slot or sub-slot
 */
export const getTicketInfo = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;

    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }

    let ticketFile = null;

    if (subSlotId) {
      const subSlot = slot.subSlots.find(ss => ss.subSlotId === subSlotId);
      if (!subSlot) {
        return res.status(404).json({ success: false, error: 'Sub-slot not found' });
      }
      ticketFile = subSlot.ticketFile;
    } else {
      ticketFile = slot.ticketFile;
    }

    if (!ticketFile || !ticketFile.fileName) {
      return res.status(404).json({ success: false, error: 'No ticket file found' });
    }

    res.status(200).json({
      success: true,
      data: ticketFile
    });
  } catch (error) {
    console.error('Error fetching ticket info:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket info' });
  }
};

/**
 * Download/serve ticket file
 */
export const downloadTicket = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;

    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }

    let ticketFile = null;

    if (subSlotId) {
      const subSlot = slot.subSlots.find(ss => ss.subSlotId === subSlotId);
      if (!subSlot) {
        return res.status(404).json({ success: false, error: 'Sub-slot not found' });
      }
      ticketFile = subSlot.ticketFile;
    } else {
      ticketFile = slot.ticketFile;
    }

    if (!ticketFile || !ticketFile.fileName) {
      return res.status(404).json({ success: false, error: 'No ticket file found' });
    }

    const filePath = path.join(__dirname, '../../uploads/tickets', ticketFile.fileName);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (err) {
      return res.status(404).json({ success: false, error: 'Ticket file not found on server' });
    }

    // Set headers for download
    res.setHeader('Content-Type', ticketFile.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${ticketFile.originalName || ticketFile.fileName}"`);
    
    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error downloading ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to download ticket' });
  }
};

/**
 * Delete ticket file
 */
export const deleteTicket = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;

    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }

    let ticketFile = null;
    let fileName = null;

    if (subSlotId) {
      const subSlotIndex = slot.subSlots.findIndex(ss => ss.subSlotId === subSlotId);
      if (subSlotIndex === -1) {
        return res.status(404).json({ success: false, error: 'Sub-slot not found' });
      }

      ticketFile = slot.subSlots[subSlotIndex].ticketFile;
      if (!ticketFile || !ticketFile.fileName) {
        return res.status(404).json({ success: false, error: 'No ticket file found' });
      }

      fileName = ticketFile.fileName;
      slot.subSlots[subSlotIndex].ticketFile = undefined;
    } else {
      ticketFile = slot.ticketFile;
      if (!ticketFile || !ticketFile.fileName) {
        return res.status(404).json({ success: false, error: 'No ticket file found' });
      }

      fileName = ticketFile.fileName;
      slot.ticketFile = undefined;
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../uploads/tickets', fileName);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error('Error deleting ticket file from filesystem:', err);
    }

    await slot.save();

    res.status(200).json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to delete ticket' });
  }
};
