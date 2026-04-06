import express from 'express';
import WebhookController from '../controllers/webhookController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/webhooks/bokun
 * Receives Bokun webhook events
 * Headers required:
 * - x-bokun-apikey: API key for authentication
 * - x-bokun-hmac: HMAC-SHA256 signature for validation
 * - x-bokun-topic: Event type (bookings/create, bookings/update, etc.)
 * - x-bokun-vendor-id: Vendor identifier
 */
router.post('/bokun', WebhookController.handleWebhook);

/**
 * GET /api/webhooks/logs
 * Get webhook logs with filtering and pagination
 * Query params:
 * - startDate: Filter logs from this date (ISO 8601)
 * - endDate: Filter logs until this date (ISO 8601)
 * - status: Filter by status (SUCCESS, FAILED, PENDING)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * Protected: ADMIN only
 */
router.get('/logs', requireRole(['ADMIN', 'STAFF']), WebhookController.getWebhookLogs);

/**
 * GET /api/webhooks/logs/:logId
 * Get a single webhook log by ID with full payload
 * Protected: ADMIN only
 */
router.get('/logs/:logId', requireRole(['ADMIN', 'STAFF']), WebhookController.getWebhookLogById);

/**
 * POST /api/webhooks/logs/:logId/retry
 * Retry a failed webhook by log ID
 * Protected: ADMIN only
 */
router.post('/logs/:logId/retry', requireRole(['ADMIN', 'STAFF']), WebhookController.retryWebhook);

/**
 * POST /api/webhooks/dev/process-data-json
 * Development mode only: Process single booking from data.json
 * Protected: ADMIN only
 */
router.post('/dev/process-data-json', requireRole(['ADMIN', 'STAFF']), WebhookController.processDevDataJson);

/**
 * POST /api/webhooks/dev/process-full-data-json
 * Development mode only: Process multiple bookings from fullData.json
 * Protected: ADMIN only
 */
router.post('/dev/process-full-data-json', requireRole(['ADMIN', 'STAFF']), WebhookController.processDevFullDataJson);

/**
 * GET /api/webhooks/dev/validate-files
 * Development mode only: Validate that data files exist
 * Protected: ADMIN only
 */
router.get('/dev/validate-files', requireRole(['ADMIN', 'STAFF']), WebhookController.validateDevDataFiles);

export default router;
