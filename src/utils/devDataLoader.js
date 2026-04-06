import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, ErrorCategory } from './errorLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Utility for loading development data from JSON files
 * Only works when NODE_ENV is set to 'development'
 */
class DevDataLoader {
  /**
   * Check if development mode is enabled
   * @returns {boolean} - True if NODE_ENV is 'development'
   */
  static isDevelopmentMode() {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Loads single booking data from backend/data.json
   * @returns {Promise<Object>} - Parsed booking data
   * @throws {Error} - If not in development mode or file cannot be read
   */
  static async loadSingleBooking() {
    if (!this.isDevelopmentMode()) {
      throw new Error('loadSingleBooking can only be used in development mode');
    }

    try {
      const dataPath = path.join(__dirname, '../../data.json');
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      logger.info(ErrorCategory.WEBHOOK, 'Successfully loaded single booking from data.json', {
        bookingId: data.bookingId,
        confirmationCode: data.confirmationCode
      });
      
      return data;
    } catch (error) {
      logger.error(ErrorCategory.WEBHOOK, 'Error loading data.json', { error });
      throw new Error(`Failed to load development data from data.json: ${error.message}`);
    }
  }

  /**
   * Loads multiple bookings data from backend/fullData.json
   * @returns {Promise<Object>} - Parsed bookings data (may contain array or single booking)
   * @throws {Error} - If not in development mode or file cannot be read
   */
  static async loadMultipleBookings() {
    if (!this.isDevelopmentMode()) {
      throw new Error('loadMultipleBookings can only be used in development mode');
    }

    try {
      const dataPath = path.join(__dirname, '../../fullData.json');
      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // Determine if it's an array or single booking
      const bookingCount = Array.isArray(data) ? data.length : 1;
      
      logger.info(ErrorCategory.WEBHOOK, 'Successfully loaded bookings from fullData.json', {
        bookingCount,
        isArray: Array.isArray(data)
      });
      
      return data;
    } catch (error) {
      logger.error(ErrorCategory.WEBHOOK, 'Error loading fullData.json', { error });
      throw new Error(`Failed to load development data from fullData.json: ${error.message}`);
    }
  }

  /**
   * Loads data from specified file (data.json or fullData.json)
   * @param {string} fileName - Name of the file ('data.json' or 'fullData.json')
   * @returns {Promise<Object>} - Parsed data
   * @throws {Error} - If not in development mode or invalid file name
   */
  static async loadFromFile(fileName) {
    if (!this.isDevelopmentMode()) {
      throw new Error('loadFromFile can only be used in development mode');
    }

    if (fileName === 'data.json') {
      return this.loadSingleBooking();
    } else if (fileName === 'fullData.json') {
      return this.loadMultipleBookings();
    } else {
      throw new Error(`Invalid file name: ${fileName}. Must be 'data.json' or 'fullData.json'`);
    }
  }

  /**
   * Validates that development data files exist
   * @returns {Promise<Object>} - Object with file existence status
   */
  static async validateDataFiles() {
    const results = {
      dataJson: false,
      fullDataJson: false,
      errors: []
    };

    try {
      const dataPath = path.join(__dirname, '../../data.json');
      await fs.access(dataPath);
      results.dataJson = true;
    } catch (error) {
      results.errors.push('data.json not found');
    }

    try {
      const fullDataPath = path.join(__dirname, '../../fullData.json');
      await fs.access(fullDataPath);
      results.fullDataJson = true;
    } catch (error) {
      results.errors.push('fullData.json not found');
    }

    return results;
  }
}

export default DevDataLoader;
