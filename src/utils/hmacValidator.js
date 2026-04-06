import crypto from 'crypto';

/**
 * Validates HMAC-SHA256 signature for webhook payloads
 * Uses constant-time comparison to prevent timing attacks
 */
class HMACValidator {
  /**
   * Validates the HMAC signature of a webhook payload
   * @param {string|Buffer} payload - The raw request body
   * @param {string} signature - The HMAC signature from x-bokun-hmac header
   * @param {string} secret - The webhook secret key
   * @returns {boolean} - True if signature is valid, false otherwise
   */
  static validate(payload, signature, secret) {
    if (!payload || !signature || !secret) {
      return false;
    }

    try {
      // Convert payload to string if it's a Buffer
      const payloadString = Buffer.isBuffer(payload) 
        ? payload.toString('utf8') 
        : payload;

      // Compute HMAC-SHA256 signature
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payloadString);
      const computedSignature = hmac.digest('hex');

      // Use constant-time comparison to prevent timing attacks
      return this.constantTimeCompare(signature, computedSignature);
    } catch (error) {
      console.error('HMAC validation error:', error);
      return false;
    }
  }

  /**
   * Performs constant-time string comparison to prevent timing attacks
   * @param {string} a - First string to compare
   * @param {string} b - Second string to compare
   * @returns {boolean} - True if strings are equal, false otherwise
   */
  static constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    // If lengths differ, still compare to maintain constant time
    const aLength = Buffer.byteLength(a);
    const bLength = Buffer.byteLength(b);
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    
    // Use crypto.timingSafeEqual for constant-time comparison
    // Pad the shorter buffer to match lengths
    const maxLength = Math.max(aLength, bLength);
    const paddedA = Buffer.alloc(maxLength);
    const paddedB = Buffer.alloc(maxLength);
    
    bufferA.copy(paddedA);
    bufferB.copy(paddedB);

    try {
      // This will throw if lengths don't match, but we've padded them
      const result = crypto.timingSafeEqual(paddedA, paddedB);
      // Only return true if original lengths matched
      return result && aLength === bLength;
    } catch (error) {
      return false;
    }
  }
}

export default HMACValidator;
