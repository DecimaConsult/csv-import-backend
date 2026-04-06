import HMACValidator from "../utils/hmacValidator.js";
import WebhookLog from "../models/WebhookLog.js";
import bookingService from "./bookingService.js";
import slotService from "./slotService.js";
import subSlotService from "./subSlotService.js";
import ticketCostService from "./ticketCostService.js";
import Product from "../models/Product.js";
import DevDataLoader from "../utils/devDataLoader.js";
import { logger, ErrorCategory } from "../utils/errorLogger.js";
import { WebhookError, ValidationError } from "../utils/customErrors.js";

/**
 * Service for handling Bokun webhook processing
 * Validates HMAC signatures, logs webhooks, and routes to appropriate handlers
 */
class WebhookService {
  /**
   * Validates HMAC signature using the webhook secret
   * @param {string|Buffer} payload - Raw request body
   * @param {string} signature - HMAC signature from x-bokun-hmac header
   * @returns {boolean} - True if valid, false otherwise
   */
  static validateHMAC(payload, signature) {
    const secret = process.env.BOKUN_WEBHOOK_SECRET;

    if (!secret) {
      console.error("BOKUN_WEBHOOK_SECRET not configured");
      return false;
    }

    return HMACValidator.validate(payload, signature, secret);
  }

  /**
   * Logs webhook event to WebhookLogs collection
   * @param {Object} headers - Request headers (may be empty if Bokun doesn't send them)
   * @param {Object} payload - Parsed webhook payload
   * @param {string} status - Processing status (SUCCESS, FAILED, PENDING)
   * @param {string} errorMessage - Error message if failed
   * @param {number} processingDurationMs - Time taken to process
   * @param {string} topic - Determined topic (passed separately since Bokun doesn't send headers)
   * @returns {Promise<Object>} - Created webhook log document
   */
  static async logWebhook(
    headers,
    payload,
    status = "PENDING",
    errorMessage = null,
    processingDurationMs = 0,
    topic = null,
  ) {
    try {
      const webhookLog = new WebhookLog({
        timestamp: new Date(),
        // Use passed topic if available, otherwise try headers, otherwise null
        bokunTopic: topic || headers["x-bokun-topic"] || null,
        bokunBookingId: headers["x-bokun-booking-id"]
          ? parseInt(headers["x-bokun-booking-id"])
          : payload?.bookingId || null,
        bokunVendorId: headers["x-bokun-vendor-id"]
          ? parseInt(headers["x-bokun-vendor-id"])
          : null,
        rawPayload: payload,
        processedStatus: status,
        errorMessage: errorMessage,
        processingDurationMs: processingDurationMs,
        activityBookingId: payload?.activityBookings?.[0]?.bookingId || null,
      });

      await webhookLog.save();
      return webhookLog;
    } catch (error) {
      console.error("Error logging webhook:", error);
      throw error;
    }
  }

  /**
   * Processes webhook based on x-bokun-topic header
   * Routes to appropriate handler (bookingService, etc.)
   * Includes retry logic for transient failures
   * @param {Object} headers - Request headers
   * @param {Object} payload - Parsed webhook payload
   * @param {Number} maxRetries - Maximum retry attempts (default: 2)
   * @returns {Promise<Object>} - Processing result
   */
  static async processWebhook(headers, payload, maxRetries = 2) {
    const startTime = Date.now();
    const fs = await import("fs");
    const path = await import("path");

    // Bokun not sending headers - determine topic from payload
    let topic = headers["x-bokun-topic"];

    if (!topic) {
      // Determine topic from payload status
      if (payload?.status === "CANCELLED" && payload?.cancellationDate) {
        topic = "bookings/cancel";
      } else {
        topic = "bookings/create"; // Default
      }
    }

    // 🔥 CRITICAL: Log webhook IMMEDIATELY before any processing
    // This ensures we have a record even if everything crashes
    let webhookLog;
    try {
      webhookLog = await this.logWebhook(
        headers,
        payload,
        "RECEIVED",
        null,
        0,
        topic,
      );
      logger.info(
        ErrorCategory.WEBHOOK,
        `Webhook received and logged: ${webhookLog._id}`,
        { logId: webhookLog._id, topic },
      );
    } catch (logError) {
      // CRITICAL FALLBACK: If DB is down, write to file system
      logger.error(
        ErrorCategory.WEBHOOK,
        "CRITICAL: Cannot create webhook log in database, writing to file system",
        { error: logError },
      );

      try {
        const logDir = path.join(process.cwd(), "backend", "logs");
        const logFile = path.join(logDir, "webhook-failures.log");
        const logEntry =
          JSON.stringify({
            timestamp: new Date().toISOString(),
            headers,
            payload,
            error: logError.message,
            stack: logError.stack,
          }) + "\n";

        await fs.promises.appendFile(logFile, logEntry);
        logger.info(
          ErrorCategory.WEBHOOK,
          "Webhook logged to file system as fallback",
        );
      } catch (fileError) {
        logger.error(
          ErrorCategory.WEBHOOK,
          "CRITICAL: Cannot write to file system either",
          { error: fileError },
        );
      }
    }

    let lastError;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // In development mode, load from data files if payload is empty or explicitly requested
        let data = payload;
        if (
          DevDataLoader.isDevelopmentMode() &&
          (!payload || Object.keys(payload).length === 0)
        ) {
          logger.info(
            ErrorCategory.WEBHOOK,
            "Development mode: Loading webhook data from data.json",
          );
          data = await DevDataLoader.loadSingleBooking();
        }

        // Validate payload has required data
        if (!data || Object.keys(data).length === 0) {
          throw new ValidationError("Webhook payload is empty");
        }

        // Update log status to PENDING (processing started)
        if (webhookLog && attempt === 1) {
          webhookLog.processedStatus = "PENDING";
          await webhookLog.save();
        }

        // Route based on topic
        let result;
        switch (topic) {
          case "bookings/create":
          case "bookings/update":
            logger.info(
              ErrorCategory.WEBHOOK,
              `Processing ${topic} webhook for booking ${data.bookingId} (attempt ${attempt}/${maxRetries + 1})`,
              { bookingId: data.bookingId, attempt },
            );

            // Create or update booking and activity bookings with slot/sub-slot assignment
            await bookingService.createOrUpdateBooking(
              data,
              async (activityBooking) => {
                // Find the raw activity data from webhook payload
                const rawActivityData = data.activityBookings?.find(
                  (ab) => ab.bookingId === activityBooking.bookingId,
                );
                await this.assignToSlotOrSubSlot(
                  activityBooking,
                  rawActivityData,
                );
              },
            );
            result = {
              success: true,
              message: `${topic} processed successfully`,
            };
            break;

          case "bookings/cancel":
            logger.info(
              ErrorCategory.WEBHOOK,
              `Processing ${topic} webhook for booking ${data.bookingId} (attempt ${attempt}/${maxRetries + 1})`,
              { bookingId: data.bookingId, attempt },
            );

            // Handle booking cancellation with slot/sub-slot recalculation
            await bookingService.handleBookingCancellation(
              data.bookingId,
              async (activityBooking) => {
                await this.handleSlotOrSubSlotCancellation(activityBooking);
              },
            );
            result = {
              success: true,
              message: `${topic} processed successfully`,
            };
            break;

          case "bookings/payment":
          case "bookings/refund":
            logger.info(
              ErrorCategory.WEBHOOK,
              `Processing ${topic} webhook - accepting silently`,
            );
            result = { success: true, message: `${topic} accepted` };
            break;

          default:
            logger.info(
              ErrorCategory.WEBHOOK,
              `Unknown topic ${topic} - accepting silently`,
            );
            result = { success: true, message: "Unknown topic accepted" };
            break;
        }

        // Update webhook log to SUCCESS
        const processingDuration = Date.now() - startTime;
        if (webhookLog) {
          try {
            webhookLog.processedStatus = "SUCCESS";
            webhookLog.processingDurationMs = processingDuration;
            await webhookLog.save();
          } catch (updateError) {
            logger.error(
              ErrorCategory.WEBHOOK,
              "Error updating webhook log to SUCCESS (processing succeeded but log update failed)",
              { error: updateError, logId: webhookLog._id },
            );
          }
        }

        logger.info(
          ErrorCategory.WEBHOOK,
          `Webhook processed successfully in ${processingDuration}ms`,
          { topic, processingDuration, attempt },
        );

        return result;
      } catch (error) {
        lastError = error;

        // Check if this is a transient error that can be retried
        const isTransientError =
          error.name === "MongoNetworkError" ||
          error.name === "MongoTimeoutError" ||
          error.code === "ECONNRESET" ||
          error.code === "ETIMEDOUT" ||
          (error.errorLabels &&
            error.errorLabels.includes("TransientTransactionError"));

        if (isTransientError && attempt <= maxRetries) {
          logger.warn(
            ErrorCategory.WEBHOOK,
            `Transient error processing webhook, retrying... (attempt ${attempt}/${maxRetries + 1})`,
            { error, topic, attempt, maxRetries },
          );

          // Wait before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        // Non-transient error or max retries reached
        logger.error(ErrorCategory.WEBHOOK, "Error processing webhook", {
          error,
          topic,
          attempt,
          bookingId: payload?.bookingId,
        });

        // Update webhook log to FAILED
        const processingDuration = Date.now() - startTime;
        if (webhookLog) {
          try {
            webhookLog.processedStatus = "FAILED";
            webhookLog.errorMessage = error.message;
            webhookLog.processingDurationMs = processingDuration;
            await webhookLog.save();
          } catch (updateError) {
            logger.error(
              ErrorCategory.WEBHOOK,
              "Error updating webhook log to FAILED",
              { error: updateError, logId: webhookLog._id },
            );
          }
        } else {
          // If we don't have a log reference, try to create one
          try {
            await this.logWebhook(
              headers,
              payload,
              "FAILED",
              error.message,
              processingDuration,
              topic,
            );
          } catch (logError) {
            logger.error(
              ErrorCategory.WEBHOOK,
              "Error creating FAILED webhook log",
              { error: logError },
            );
          }
        }

        throw new WebhookError(`Failed to process webhook: ${error.message}`);
      }
    }

    // If we get here, all retries failed
    logger.error(
      ErrorCategory.WEBHOOK,
      "Failed to process webhook after maximum retries",
      { error: lastError, topic, maxRetries },
    );

    throw new WebhookError("Failed to process webhook after maximum retries");
  }

  /**
   * Auto-create product from webhook data if it doesn't exist
   * @param {Object} activityBooking - ActivityBooking document from DB
   * @param {Object} rawActivityData - Raw activity data from webhook payload
   * @returns {Promise<Object>} Created or existing product
   */
  static async ensureProductExists(activityBooking, rawActivityData) {
    const productId = String(activityBooking.productId);

    let product = await Product.findOne({ productId });

    if (!product) {
      logger.info(
        ErrorCategory.WEBHOOK,
        `Product ${productId} not found, creating from webhook data`,
        { productId },
      );

      // Get product details from raw webhook data
      const productData = rawActivityData?.product || rawActivityData?.activity;

      // Calculate duration from webhook data (hours * 60 + minutes)
      const durationHours = productData?.durationHours || 0;
      const durationMinutes = productData?.durationMinutes || 0;
      const totalDurationMinutes = durationHours * 60 + durationMinutes || 120; // Default to 120 if no duration provided

      product = new Product({
        productId: productId,
        name:
          productData?.title ||
          activityBooking.productTitle ||
          "Unknown Product",
        externalId:
          productData?.externalId || activityBooking.externalProductId || "",
        durationMinutes: totalDurationMinutes,
        requiresSubSlots: false, // Default to single-slot, admin can change later
        requiresTickets: false,
        createdFromWebhook: true,
      });

      await product.save();

      logger.info(
        ErrorCategory.WEBHOOK,
        `Auto-created product ${productId}: ${product.name}`,
        {
          productId,
          name: product.name,
          durationMinutes: product.durationMinutes,
        },
      );
    }

    return product;
  }

  /**
   * Assign activity booking to slot or sub-slot based on product configuration
   * UNIFIED SYSTEM: Always uses subSlotService for all bookings
   * @param {Object} activityBooking - ActivityBooking document
   * @param {Object} rawActivityData - Raw activity data from webhook payload
   * @returns {Promise<Object>} Assigned slot or sub-slot result
   */
  static async assignToSlotOrSubSlot(activityBooking, rawActivityData = null) {
    try {
      const { productId, status } = activityBooking;

      // Only assign confirmed or pending bookings
      if (status === "CANCELLED") {
        logger.info(
          ErrorCategory.WEBHOOK,
          `Skipping cancelled booking ${activityBooking.bookingId}`,
          { bookingId: activityBooking.bookingId },
        );
        return null;
      }

      // Ensure product exists (auto-create if needed)
      const product = await this.ensureProductExists(
        activityBooking,
        rawActivityData,
      );

      if (!product) {
        logger.warn(
          ErrorCategory.WEBHOOK,
          `Product ${productId} not found and could not be created`,
          { productId, bookingId: activityBooking.bookingId },
        );
        throw new ValidationError(`Product ${productId} not found`);
      }

      // UNIFIED SYSTEM: Always use subSlotService
      // - Single-slot products: Creates Sub-Slot A only
      // - Multi-slot products: Creates Sub-Slots A, B, C... as needed
      logger.info(
        ErrorCategory.WEBHOOK,
        `Assigning booking ${activityBooking.bookingId} to ${product.requiresSubSlots ? "multi-slot" : "single-slot"} product`,
        {
          bookingId: activityBooking.bookingId,
          productId,
          requiresSubSlots: product.requiresSubSlots,
        },
      );

      const result = await subSlotService.processBookingWithSubSlots(
        activityBooking,
        product,
      );

      // Trigger ticket cost recalculation for the sub-slot
      if (result.success && result.subSlot) {
        logger.info(
          ErrorCategory.WEBHOOK,
          `Recalculating ticket cost for sub-slot ${result.subSlot.subSlotId}`,
          { subSlotId: result.subSlot.subSlotId, slotId: result.timeSlot._id },
        );
        await ticketCostService.updateSubSlotTicketCost(
          result.timeSlot,
          result.subSlot.subSlotId,
          product,
        );
      }

      return result;
    } catch (error) {
      logger.error(
        ErrorCategory.WEBHOOK,
        "Error assigning to slot or sub-slot",
        { error },
      );
      throw error;
    }
  }

  /**
   * Handle cancellation for slot or sub-slot based on booking assignment
   * UNIFIED SYSTEM: Always uses subSlotService for recalculation
   * @param {Object} activityBooking - Cancelled ActivityBooking document
   * @returns {Promise<Object>} Updated slot or sub-slot result
   */
  static async handleSlotOrSubSlotCancellation(activityBooking) {
    try {
      const { slotId, subSlotId, productId, bookingId } = activityBooking;

      if (!slotId) {
        logger.info(
          ErrorCategory.WEBHOOK,
          `No slot assigned to cancelled booking ${bookingId}`,
          { bookingId },
        );
        return null;
      }

      // Ensure product exists (auto-create if needed)
      const product = await this.ensureProductExists(activityBooking);

      if (!product) {
        logger.warn(
          ErrorCategory.WEBHOOK,
          `Product ${productId} not found and could not be created for cancellation`,
          { productId, bookingId },
        );
        throw new ValidationError(`Product ${productId} not found`);
      }

      // UNIFIED SYSTEM: Always use subSlotService for recalculation
      // All bookings have subSlotId (at least "A"), so we always recalculate sub-slot
      logger.info(
        ErrorCategory.WEBHOOK,
        `Handling cancellation for sub-slot ${subSlotId || "A"}`,
        { bookingId, slotId, subSlotId: subSlotId || "A" },
      );

      // Import TimeSlot model
      const TimeSlot = (await import("../models/TimeSlot.js")).default;

      // Get the time slot
      const timeSlot = await TimeSlot.findById(slotId);

      if (!timeSlot) {
        logger.warn(ErrorCategory.WEBHOOK, `Time slot ${slotId} not found`, {
          slotId,
          bookingId,
        });
        return null;
      }

      // Recalculate sub-slot capacity (defaults to "A" if not specified)
      const targetSubSlotId = subSlotId || "A";
      await subSlotService.recalculateSubSlotCapacity(
        timeSlot,
        targetSubSlotId,
      );

      // Recalculate ticket cost for the sub-slot
      logger.info(
        ErrorCategory.WEBHOOK,
        `Recalculating ticket cost after cancellation for sub-slot ${targetSubSlotId}`,
        { subSlotId: targetSubSlotId, slotId: timeSlot._id },
      );
      await ticketCostService.updateSubSlotTicketCost(
        timeSlot,
        targetSubSlotId,
        product,
      );

      return timeSlot;
    } catch (error) {
      logger.error(
        ErrorCategory.WEBHOOK,
        "Error handling slot or sub-slot cancellation",
        { error },
      );
      throw error;
    }
  }

  /**
   * Process multiple bookings from fullData.json in development mode
   * This is useful for bulk testing and seeding data
   * @returns {Promise<Object>} - Processing results
   */
  static async processFullDataFile() {
    if (!DevDataLoader.isDevelopmentMode()) {
      throw new Error(
        "processFullDataFile can only be used in development mode",
      );
    }

    try {
      logger.info(
        ErrorCategory.WEBHOOK,
        "Loading multiple bookings from fullData.json",
      );
      const data = await DevDataLoader.loadMultipleBookings();

      // Handle both array and single booking formats
      const bookings = Array.isArray(data) ? data : [data];

      logger.info(
        ErrorCategory.WEBHOOK,
        `Processing ${bookings.length} bookings from fullData.json`,
      );

      const results = {
        total: bookings.length,
        successful: 0,
        failed: 0,
        errors: [],
      };

      // Process each booking
      for (let i = 0; i < bookings.length; i++) {
        const booking = bookings[i];
        try {
          logger.info(
            ErrorCategory.WEBHOOK,
            `Processing booking ${i + 1}/${bookings.length}: ${booking.bookingId}`,
          );

          // Create mock headers for the booking
          const mockHeaders = {
            "x-bokun-topic": "bookings/create",
            "x-bokun-booking-id": String(booking.bookingId),
            "x-bokun-vendor-id": "1234",
            "x-bokun-apikey": process.env.BOKUN_API_KEY,
          };

          // Process the booking (skip HMAC validation in dev mode)
          await this.processWebhook(mockHeaders, booking, 0); // 0 retries for bulk processing
          results.successful++;
        } catch (error) {
          logger.error(
            ErrorCategory.WEBHOOK,
            `Error processing booking ${booking.bookingId}`,
            { error, bookingId: booking.bookingId },
          );
          results.failed++;
          results.errors.push({
            bookingId: booking.bookingId,
            error: error.message,
          });
        }
      }

      logger.info(
        ErrorCategory.WEBHOOK,
        `Completed processing fullData.json: ${results.successful} successful, ${results.failed} failed`,
      );

      return results;
    } catch (error) {
      logger.error(ErrorCategory.WEBHOOK, "Error processing fullData.json", {
        error,
      });
      throw new WebhookError(
        `Failed to process fullData.json: ${error.message}`,
      );
    }
  }
}

export default WebhookService;
