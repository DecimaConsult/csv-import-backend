import express from 'express';
import {
  sendInviteToGuide,
  getInvitationStatus,
  checkInvitationStatus,
  webhookReceiver
} from '../controllers/calendarController.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/slots/:slotId/invite-guide
 * Send calendar invite to guide (ADMIN and STAFF)
 */
router.post('/slots/:slotId/invite-guide', requireRole(['ADMIN', 'STAFF']), sendInviteToGuide);

/**
 * GET /api/slots/:slotId/invitations
 * Get invitation status for slot (ADMIN and STAFF)
 */
router.get('/slots/:slotId/invitations', requireRole(['ADMIN', 'STAFF']), getInvitationStatus);

/**
 * POST /api/calendar/invitations/:invitationId/check
 * Manually check and update invitation status from Google (ADMIN and STAFF)
 */
router.post('/calendar/invitations/:invitationId/check', requireRole(['ADMIN', 'STAFF']), checkInvitationStatus);

/**
 * POST /api/calendar/webhook
 * Webhook receiver for Google Calendar notifications (public endpoint)
 */
router.post('/calendar/webhook', webhookReceiver);

export default router;
