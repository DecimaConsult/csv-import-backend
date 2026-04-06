import axios from 'axios';
import crypto from 'crypto';
import { logger, ErrorCategory } from '../utils/errorLogger.js';

/**
 * Service for interacting with Bokun API
 * Handles authentication and API calls
 */
class BokunApiService {
  /**
   * Generate HMAC signature for Bokun API authentication
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - API path (e.g., /booking.json/booking/123)
   * @param {string} date - Bokun date format (YYYY-MM-DD HH:mm:ss)
   * @param {string} secretKey - Bokun secret key
   * @returns {string} Base64 encoded signature
   */
  static generateSignature(method, path, date, secretKey) {
    const accessKey = process.env.BOKUN_ACCESS_KEY;
    const signatureBase = date + accessKey + method + path;
    const hmac = crypto.createHmac('sha1', secretKey);
    hmac.update(signatureBase);
    return hmac.digest('base64');
  }

  /**
   * Get current date in Bokun format (YYYY-MM-DD HH:mm:ss)
   * @returns {string} Formatted date string
   */
  static getBokunDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Fetch booking from Bokun API by confirmation code
   * @param {string} confirmationCode - Booking confirmation code (e.g., "VIA-70887957")
   * @returns {Promise<Object>} Booking data from Bokun
   * @throws {Error} If API call fails or booking not found
   */
  static async fetchBookingByConfirmationCode(confirmationCode) {
    try {
      logger.info(ErrorCategory.WEBHOOK, 
        `Fetching booking ${confirmationCode} from Bokun API`,
        { confirmationCode }
      );

      const accessKey = process.env.BOKUN_ACCESS_KEY;
      const secretKey = process.env.BOKUN_SECRET_KEY;

      if (!accessKey || !secretKey) {
        throw new Error('BOKUN_ACCESS_KEY or BOKUN_SECRET_KEY not configured');
      }

      const path = `/booking.json/booking/${confirmationCode}`;
      const date = this.getBokunDate();
      const signature = this.generateSignature('GET', path, date, secretKey);

      const response = await axios.get(
        `https://api.bokun.io${path}`,
        {
          headers: {
            'X-Bokun-Date': date,
            'X-Bokun-AccessKey': accessKey,
            'X-Bokun-Signature': signature,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      logger.info(ErrorCategory.WEBHOOK, 
        `Successfully fetched booking ${confirmationCode} from Bokun`,
        { confirmationCode, bookingId: response.data.bookingId }
      );

      return response.data;

    } catch (error) {
      if (error.response) {
        // Bokun API returned an error
        const status = error.response.status;
        const message = error.response.data?.message || error.response.statusText;

        logger.error(ErrorCategory.WEBHOOK, 
          `Bokun API error for ${confirmationCode}`,
          { confirmationCode, status, message, data: error.response.data }
        );

        if (status === 404) {
          throw new Error(`Booking ${confirmationCode} not found in Bokun`);
        } else if (status === 401 || status === 403) {
          throw new Error('Bokun API authentication failed. Check your API credentials.');
        } else {
          throw new Error(`Bokun API error: ${message}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        logger.error(ErrorCategory.WEBHOOK, 
          `Bokun API timeout for ${confirmationCode}`,
          { confirmationCode }
        );
        throw new Error('Bokun API request timed out. Please try again.');
      } else {
        logger.error(ErrorCategory.WEBHOOK, 
          `Error fetching booking from Bokun`,
          { confirmationCode, error: error.message }
        );
        throw new Error(`Failed to fetch booking: ${error.message}`);
      }
    }
  }
}

export default BokunApiService;
