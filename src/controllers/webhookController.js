import WebhookService from "../services/webhookService.js";
import WebhookLog from "../models/WebhookLog.js";
import DevDataLoader from "../utils/devDataLoader.js";

/**
 * Controller for handling Bokun webhook endpoints
 */
class WebhookController {
  /**
   * Handles incoming Bokun webhooks
   * Returns 200 OK immediately and processes asynchronously
   * In development mode, can process data from local JSON files
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleWebhook(req, res) {
    try {
      // Log received webhook
      console.log("📥 Webhook received from Bokun");
      console.log("📦 Payload size:", JSON.stringify(req.body).length, "bytes");

      // Return 200 OK immediately (Bokun requirement)
      res.status(200).send("OK");

      (async () => {
        try {
          const bookingId = req.body?.bookingId;

          // ✅ DEDUP CHECK (ADD THIS)
          const existing = await WebhookLog.findOne({
            bokunBookingId: bookingId,
            processedStatus: { $in: ["PENDING", "SUCCESS"] },
          });

          if (existing) {
            console.log("⛔ Duplicate webhook skipped:", bookingId);
            return;
          }

          // ✅ PROCESS ONLY ONCE
          await WebhookService.processWebhook(req.headers, req.body);

          console.log("✅ Webhook processed successfully");
        } catch (error) {
          console.error("❌ Error processing webhook:", error);
        }
      })();
    } catch (error) {
      console.error("❌ Error in webhook handler:", error);
      // Always return 200 OK to Bokun
      res.status(200).send("OK");
    }
  }

  /**
   * Get webhook logs with filtering and pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getWebhookLogs(req, res) {
    try {
      const { startDate, endDate, status, page = 1, limit = 50 } = req.query;

      // Build query filter
      const filter = {};

      // Date range filter
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) {
          filter.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          filter.timestamp.$lte = new Date(endDate);
        }
      }

      // Status filter
      if (status) {
        filter.processedStatus = status.toUpperCase();
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Query webhook logs
      const logs = await WebhookLog.find(filter)
        .sort({ timestamp: -1 }) // Most recent first
        .skip(skip)
        .limit(parseInt(limit))
        .select("-rawPayload") // Exclude large payload by default
        .lean();

      // Get total count for pagination
      const total = await WebhookLog.countDocuments(filter);

      // Return paginated response
      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching webhook logs:", error);
      res.status(500).json({
        error: "Failed to fetch webhook logs",
        message: error.message,
      });
    }
  }

  /**
   * Get a single webhook log by ID with full payload
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getWebhookLogById(req, res) {
    try {
      const { logId } = req.params;

      const log = await WebhookLog.findById(logId).lean();

      if (!log) {
        return res.status(404).json({
          error: "Webhook log not found",
        });
      }

      res.json(log);
    } catch (error) {
      console.error("Error fetching webhook log:", error);
      res.status(500).json({
        error: "Failed to fetch webhook log",
        message: error.message,
      });
    }
  }

  /**
   * Development mode only: Process single booking from data.json
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async processDevDataJson(req, res) {
    try {
      // Only allow in development mode
      if (!DevDataLoader.isDevelopmentMode()) {
        return res.status(403).json({
          error: "This endpoint is only available in development mode",
        });
      }

      console.log("[DEV MODE] Processing data.json");

      // Load and process data.json
      const data = await DevDataLoader.loadSingleBooking();

      // Create mock headers
      const mockHeaders = {
        "x-bokun-topic": "bookings/create",
        "x-bokun-booking-id": String(data.bookingId),
        "x-bokun-vendor-id": "1234",
        "x-bokun-apikey": process.env.BOKUN_API_KEY,
      };

      // Process the webhook
      const result = await WebhookService.processWebhook(mockHeaders, data, 0);

      res.json({
        success: true,
        message: "Successfully processed data.json",
        bookingId: data.bookingId,
        result,
      });
    } catch (error) {
      console.error("Error processing data.json:", error);
      res.status(500).json({
        error: "Failed to process data.json",
        message: error.message,
      });
    }
  }

  /**
   * Development mode only: Process multiple bookings from fullData.json
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async processDevFullDataJson(req, res) {
    try {
      // Only allow in development mode
      if (!DevDataLoader.isDevelopmentMode()) {
        return res.status(403).json({
          error: "This endpoint is only available in development mode",
        });
      }

      console.log("[DEV MODE] Processing fullData.json");

      // Process all bookings from fullData.json
      const results = await WebhookService.processFullDataFile();

      res.json({
        success: true,
        message: "Successfully processed fullData.json",
        results,
      });
    } catch (error) {
      console.error("Error processing fullData.json:", error);
      res.status(500).json({
        error: "Failed to process fullData.json",
        message: error.message,
      });
    }
  }

  /**
   * Retry a failed webhook by log ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async retryWebhook(req, res) {
    try {
      const { logId } = req.params;

      // Get the webhook log with full payload
      const log = await WebhookLog.findById(logId);

      if (!log) {
        return res.status(404).json({
          error: "Webhook log not found",
        });
      }

      if (!log.rawPayload) {
        return res.status(400).json({
          error: "Cannot retry: webhook payload not available",
        });
      }

      console.log(`🔄 Retrying webhook ${logId}`);

      // Reconstruct headers from log
      const headers = {
        "x-bokun-topic": log.topic || "bookings/create",
        "x-bokun-booking-id": String(log.bookingId || ""),
        "x-bokun-vendor-id": log.vendorId || "",
      };

      // Process the webhook again
      await WebhookService.processWebhook(headers, log.rawPayload);

      // Update the original log to mark it as retried
      log.processedStatus = "RETRIED";
      log.errorMessage = "Webhook was manually retried";
      await log.save();

      console.log(`✅ Webhook ${logId} retried successfully`);

      res.json({
        success: true,
        message: "Webhook retried successfully",
        logId,
      });
    } catch (error) {
      console.error("Error retrying webhook:", error);
      res.status(500).json({
        error: "Failed to retry webhook",
        message: error.message,
      });
    }
  }

  /**
   * Development mode only: Validate that data files exist
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async validateDevDataFiles(req, res) {
    try {
      // Only allow in development mode
      if (!DevDataLoader.isDevelopmentMode()) {
        return res.status(403).json({
          error: "This endpoint is only available in development mode",
        });
      }

      const validation = await DevDataLoader.validateDataFiles();

      res.json({
        mode: "development",
        files: validation,
        ready: validation.dataJson && validation.fullDataJson,
      });
    } catch (error) {
      console.error("Error validating data files:", error);
      res.status(500).json({
        error: "Failed to validate data files",
        message: error.message,
      });
    }
  }
}

export default WebhookController;
