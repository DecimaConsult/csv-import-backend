import calendarService from '../services/calendarService.js';
import CalendarInvitation from '../models/CalendarInvitation.js';
import TimeSlot from '../models/TimeSlot.js';
import Guide from '../models/Guide.js';

/**
 * Send calendar invite to guide
 * POST /api/slots/:slotId/invite-guide
 */
export const sendInviteToGuide = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { guideId } = req.body;

    if (!guideId) {
      return res.status(400).json({
        success: false,
        error: 'guideId is required'
      });
    }

    // Fetch slot and guide details
    const slot = await TimeSlot.findById(slotId);
    const guide = await Guide.findById(guideId).populate('userId');

    if (!slot) {
      return res.status(404).json({
        success: false,
        error: 'Slot not found'
      });
    }

    if (!guide) {
      return res.status(404).json({
        success: false,
        error: 'Guide not found'
      });
    }

    // Fetch product to get nickname
    const Product = (await import('../models/Product.js')).default;
    const product = await Product.findOne({ productId: String(slot.productId) }).select('nickname name');

    // Determine which email to use
    const guideEmail = guide.calendarEmail || guide.email;

    // Prepare tour details with product nickname
    const tourDetails = {
      tourName: slot.productTitle,
      nickname: product?.nickname || null,  // ONLY use nickname, NO fallback to product title
      guideName: guide.guideName,
      guideTier: guide.tier,
      startTime: slot.startDateTime,
      endTime: slot.endDateTime,
      location: 'Tour Location',
      passengerCount: slot.currentPassengerCount,
      isSubSlot: false
    };

    // Send invite (includes availability check)
    const result = await calendarService.sendInviteWithWebhook(
      slotId,
      guideId,
      guideEmail,
      tourDetails
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Return response based on conflict status
    if (result.hasConflict) {
      return res.status(200).json({
        success: true,
        data: {
          invitationId: result.invitationId,
          status: 'calendar_conflict',
          conflictReason: result.conflictReason
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        invitationId: result.invitationId,
        eventId: result.eventId,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Error in sendInviteToGuide:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send invite'
    });
  }
};

/**
 * Get invitation status for a slot
 * GET /api/slots/:slotId/invitations
 */
export const getInvitationStatus = async (req, res) => {
  try {
    const { slotId } = req.params;

    const invitations = await CalendarInvitation.find({ slotId })
      .populate('guideId', 'guideName email')
      .sort({ invitedAt: -1 });

    const formattedInvitations = invitations.map(inv => ({
      invitationId: inv._id,
      guideId: inv.guideId._id,
      guideName: inv.guideId.guideName,
      status: inv.status,
      invitedAt: inv.invitedAt,
      respondedAt: inv.respondedAt,
      conflictReason: inv.conflictReason
    }));

    res.status(200).json({
      success: true,
      data: formattedInvitations
    });
  } catch (error) {
    console.error('Error in getInvitationStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitation status'
    });
  }
};

/**
 * Webhook receiver for Google Calendar notifications
 * POST /api/calendar/webhook
 */
export const webhookReceiver = async (req, res) => {
  try {
    const result = await calendarService.processWebhookNotification(
      req.headers,
      req.body
    );

    res.status(200).json({
      success: result.success,
      action: result.action
    });
  } catch (error) {
    console.error('Error in webhookReceiver:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
};

/**
 * Manually check and update invitation status from Google Calendar
 * POST /api/calendar/invitations/:invitationId/check
 */
export const checkInvitationStatus = async (req, res) => {
  try {
    const { invitationId } = req.params;

    const result = await calendarService.checkInvitationStatusManually(invitationId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        status: result.status,
        respondedAt: result.respondedAt,
        conflictReason: result.conflictReason
      }
    });
  } catch (error) {
    console.error('❌ Error checking invitation status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
