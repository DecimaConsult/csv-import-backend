import { google } from 'googleapis';
import CalendarInvitation from '../models/CalendarInvitation.js';
import TimeSlot from '../models/TimeSlot.js';
import Guide from '../models/Guide.js';

class CalendarService {
  constructor() {
    this.calendar = null;
    this.calendarId = null;
    this.timezone = process.env.TIMEZONE || 'Europe/Paris';
    this.backendUrl = process.env.BACKEND_URL;
    this.initialized = false;
  }

  /**
   * Initialize the calendar service with OAuth credentials
   */
  async initialize() {
    try {
      // console.log('\n🔍 CALENDAR INITIALIZATION DEBUG:');
      // console.log('=====================================');
      
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
      this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      // console.log('OAuth Client ID:', clientId?.substring(0, 20) + '...');
      // console.log('OAuth Client Secret:', clientSecret ? '***' : '(not set)');
      // console.log('Refresh Token:', refreshToken ? '***' : '(not set)');
      // console.log('Calendar ID:', this.calendarId);

      if (!clientId || !clientSecret || !refreshToken) {
        console.warn('⚠️  Google Calendar OAuth credentials not configured - Calendar features disabled');
        this.initialized = false;
        return false;
      }

      // Create OAuth2 client
      // console.log('Creating OAuth2 client...');
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
      );

      // Set refresh token
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      // Test the connection
      // console.log('Testing OAuth connection...');
      await oauth2Client.getAccessToken();
      // console.log('✓ OAuth access token obtained');

      // Create calendar client
      this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Verify calendar access
      // console.log('Verifying calendar access...');
      const calendarInfo = await this.calendar.calendars.get({
        calendarId: this.calendarId
      });
      console.log('✓ Google Calendar initialized:', calendarInfo.data.summary);

      this.initialized = true;
      // console.log('✓ Google Calendar service initialized successfully');
      // console.log('=====================================\n');
      return true;
    } catch (error) {
      console.error('\n❌ CALENDAR INITIALIZATION ERROR:');
      console.error('=====================================');
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.code);
      console.error('Error Status:', error.status);
      console.error('Error Details:', JSON.stringify(error.errors || [], null, 2));
      console.error('Full Error:', error);
      console.error('=====================================\n');
      this.initialized = false;
      return false;
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * REMOVED: getCalendarForUser() - no longer needed for shared calendar approach
   * Guides use personal Gmail accounts, not Google Workspace accounts
   */

  /**
   * Check if guide has availability for a time slot
   * Checks guide's availability records in the database
   * @param {string} guideEmail - Guide's email
   * @param {Date} startTime - Slot start time
   * @param {Date} endTime - Slot end time
   * @param {string} excludeSlotId - Slot ID to exclude from conflict check (for reassignments)
   * @param {boolean} skipTimeRangeCheck - Skip time range validation (for calendar invites)
   * @param {string} productId - Product ID for duration lookup (optional)
   * @returns {Object} { available: boolean, conflictingEvents: [], reason: string }
   */
  async checkGuideAvailability(guideEmail, startTime, endTime, excludeSlotId = null, skipTimeRangeCheck = false, productId = null) {
    // console.log('\n🔍 CHECK AVAILABILITY DEBUG:');
    // console.log('Guide Email:', guideEmail);
    // console.log('Start Time:', startTime.toISOString());
    // console.log('End Time:', endTime.toISOString());
    // console.log('Exclude Slot ID:', excludeSlotId);
    // console.log('Product ID:', productId);
    
    try {
      // If productId provided, fetch product and apply 30min buffer
      let checkStartTime = startTime;
      let checkEndTime = endTime;

      if (productId) {
        const Product = (await import('../models/Product.js')).default;
        const product = await Product.findOne({ productId: String(productId) });
        
        if (product && product.durationMinutes) {
          // Apply 30min buffer before tour start
          checkStartTime = new Date(startTime.getTime() - (30 * 60 * 1000));
          
          // Use product duration for end time
          checkEndTime = new Date(startTime.getTime() + (product.durationMinutes * 60 * 1000));
          
          console.log(`📅 Applying 30min buffer + ${product.durationMinutes}min duration`);
          console.log(`   Original: ${startTime.toISOString()} - ${endTime.toISOString()}`);
          console.log(`   Checking: ${checkStartTime.toISOString()} - ${checkEndTime.toISOString()}`);
        }
      }

      // Find guide by email or calendar email
      const guide = await Guide.findOne({
        $or: [
          { email: guideEmail },
          { calendarEmail: guideEmail }
        ]
      });

      if (!guide) {
        return {
          available: false,
          conflictingEvents: [],
          reason: 'Guide not found in system'
        };
      }

      // Get the date for the slot (ignore time for date comparison)
      const slotDate = new Date(startTime);
      slotDate.setHours(0, 0, 0, 0);

      // Check if guide has availability record for this date
      const availabilityRecord = guide.availability.find(avail => {
        const availDate = new Date(avail.date);
        availDate.setHours(0, 0, 0, 0);
        return availDate.getTime() === slotDate.getTime();
      });

      // Only check availability status and time if they've set it
      if (availabilityRecord) {
        // Check if guide is unavailable or on leave
        if (availabilityRecord.status === 'Unavailable') {
          return {
            available: false,
            conflictingEvents: [],
            reason: 'Guide is unavailable on this date'
          };
        }

        if (availabilityRecord.status === 'OnLeave') {
          return {
            available: false,
            conflictingEvents: [],
            reason: 'Guide is on leave on this date'
          };
        }

        // Check time range if specified (skip for calendar invites)
        if (!skipTimeRangeCheck && availabilityRecord.startTime && availabilityRecord.endTime) {
          const slotStartHour = startTime.getHours();
          const slotStartMinute = startTime.getMinutes();
          const slotEndHour = endTime.getHours();
          const slotEndMinute = endTime.getMinutes();

          // Parse availability time range (format: "HH:MM")
          const [availStartHour, availStartMinute] = availabilityRecord.startTime.split(':').map(Number);
          const [availEndHour, availEndMinute] = availabilityRecord.endTime.split(':').map(Number);

          const slotStartMinutes = slotStartHour * 60 + slotStartMinute;
          const slotEndMinutes = slotEndHour * 60 + slotEndMinute;
          const availStartMinutes = availStartHour * 60 + availStartMinute;
          const availEndMinutes = availEndHour * 60 + availEndMinute;

          // console.log('Time comparison:');
          // console.log('  Slot:', `${slotStartHour}:${slotStartMinute} - ${slotEndHour}:${slotEndMinute}`);
          // console.log('  Available:', `${availStartHour}:${availStartMinute} - ${availEndHour}:${availEndMinute}`);

          if (slotStartMinutes < availStartMinutes || slotEndMinutes > availEndMinutes) {
            // console.log('❌ Slot time outside guide availability window');
            return {
              available: false,
              conflictingEvents: [],
              reason: `Guide is only available from ${availabilityRecord.startTime} to ${availabilityRecord.endTime}`
            };
          }
        }

        // REMOVED: Time range check - invites should be independent of availability time windows
        // Only block if guide is explicitly Unavailable or OnLeave
      } else {
        // console.log('⚠️  No availability record found - will skip availability checks and only check for conflicts');
      }

      // Check if guide is already assigned to another slot at this time
      // Build query to exclude the current slot if provided
      // USE checkStartTime and checkEndTime for conflict detection
      const slotQuery = {
        _id: { $in: guide.assignedSlots },
        startDateTime: { $lt: checkEndTime },
        endDateTime: { $gt: checkStartTime }
      };
      
      // Exclude current slot from conflict check (for reassignments)
      if (excludeSlotId) {
        slotQuery._id.$nin = [excludeSlotId];
        // console.log('Excluding slot from conflict check:', excludeSlotId);
      }

      const assignedSlots = await TimeSlot.find(slotQuery);

      if (assignedSlots.length > 0) {
        // console.log('❌ Guide already assigned to another slot at this time');
        // console.log('Conflicting slots:', assignedSlots.map(s => ({ id: s._id, title: s.productTitle, start: s.startDateTime, end: s.endDateTime })));
        return {
          available: false,
          conflictingEvents: assignedSlots.map(slot => ({
            title: slot.productTitle,
            start: slot.startDateTime,
            end: slot.endDateTime
          })),
          reason: `Guide is already assigned to ${assignedSlots.length} tour(s) during this time`
        };
      }

      // Check guide's actual Google Calendar for conflicts using FreeBusy API
      // USE checkStartTime and checkEndTime for calendar conflict detection
      if (this.initialized) {
        // console.log('Checking guide\'s Google Calendar for conflicts...');
        try {
          const freeBusyResponse = await this.calendar.freebusy.query({
            requestBody: {
              timeMin: checkStartTime.toISOString(),
              timeMax: checkEndTime.toISOString(),
              items: [{ id: guideEmail }]
            }
          });

          const busyTimes = freeBusyResponse.data.calendars?.[guideEmail]?.busy || [];
          
          // CRITICAL FIX: Filter out events that WE created (from our shared calendar)
          // When we send invites, they appear in the guide's calendar as attendee
          // We need to check if these busy times are actually OTHER events, not ours
          if (busyTimes.length > 0) {
            // console.log(`Found ${busyTimes.length} busy time(s), checking if they're external events...`);
            
            // Get all events in the time range from OUR shared calendar
            const ourEvents = await this.calendar.events.list({
              calendarId: this.calendarId,
              timeMin: checkStartTime.toISOString(),
              timeMax: checkEndTime.toISOString(),
              singleEvents: true
            });
            
            // Filter out busy times that match our events (by comparing time ranges)
            const externalBusyTimes = busyTimes.filter(busy => {
              const busyStart = new Date(busy.start).getTime();
              const busyEnd = new Date(busy.end).getTime();
              
              // Check if this busy time matches any of our events
              const isOurEvent = ourEvents.data.items?.some(event => {
                const eventStart = new Date(event.start.dateTime || event.start.date).getTime();
                const eventEnd = new Date(event.end.dateTime || event.end.date).getTime();
                
                // Match if times are exactly the same (within 1 minute tolerance)
                return Math.abs(busyStart - eventStart) < 60000 && Math.abs(busyEnd - eventEnd) < 60000;
              });
              
              return !isOurEvent; // Keep only external events
            });
            
            if (externalBusyTimes.length > 0) {
              return {
                available: false,
                conflictingEvents: externalBusyTimes.map(busy => ({
                  start: new Date(busy.start),
                  end: new Date(busy.end)
                })),
                reason: `Guide has ${externalBusyTimes.length} event(s) in their calendar during this time`
              };
            }
          }
        } catch (calendarError) {
          console.warn('⚠️  Could not check guide\'s Google Calendar:', calendarError.message);
          // Continue without calendar check - guide may not have shared calendar
        }
      }

      // console.log('✅ Guide is available');
      return {
        available: true,
        conflictingEvents: [],
        reason: null
      };
    } catch (error) {
      console.error('❌ Error checking availability:', error);
      return {
        available: false,
        conflictingEvents: [],
        reason: `Error checking availability: ${error.message}`
      };
    }
  }

  /**
   * Create a calendar event for a direct guide assignment
   * @param {Object} assignment - Assignment details
   * @returns {Object} { success: boolean, eventId: string, error?: string }
   */
  async createEvent(assignment) {
    if (!this.initialized) {
      console.warn('Calendar service not initialized, skipping event creation');
      return { success: false, error: 'Calendar service not initialized' };
    }

    try {
      // Format date/time for summary (nickname - date and time)
      const startDate = new Date(assignment.startTime);
      const formattedDateTime = startDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: this.timezone
      });
      
      const event = {
        summary: `${assignment.nickname || assignment.tourName} - ${formattedDateTime}`,
        description: '',  // Empty description as requested
        location: assignment.location || 'TBD',
        start: {
          dateTime: assignment.startTime.toISOString(),
          timeZone: this.timezone
        },
        end: {
          dateTime: assignment.endTime.toISOString(),
          timeZone: this.timezone
        },
        attendees: [
          { email: assignment.guideEmail }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },  // 1 day before
            { method: 'popup', minutes: 60 }         // 1 hour before
          ]
        }
      };

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId, // Insert into shared calendar
        resource: event,
        sendUpdates: 'all'  // Send email invite to guide
      });

      return {
        success: true,
        eventId: response.data.id
      };
    } catch (error) {
      console.error('Error creating calendar event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send a manual invite with webhook tracking (includes availability check)
   * @param {string} slotId - Slot ID
   * @param {string} guideId - Guide ID
   * @param {string} guideEmail - Guide's calendar email
   * @param {Object} tourDetails - Tour details
   * @returns {Object} { success: boolean, invitationId: string, eventId: string, hasConflict: boolean, conflictReason?: string, error?: string }
   */
  async sendInviteWithWebhook(slotId, guideId, guideEmail, tourDetails) {
    // console.log('\n📧 SEND INVITE DEBUG:');
    // console.log('=====================================');
    // console.log('Slot ID:', slotId);
    // console.log('Guide ID:', guideId);
    // console.log('Guide Email:', guideEmail);
    // console.log('Tour Details:', JSON.stringify(tourDetails, null, 2));
    // console.log('Calendar Initialized:', this.initialized);
    // console.log('Calendar ID:', this.calendarId);
    
    if (!this.initialized) {
      console.warn('⚠️  Calendar service not initialized - cannot send invite');
      return {
        success: false,
        error: 'Calendar service not initialized. Please configure Google Calendar credentials in .env file. See GOOGLE-CALENDAR-SETUP-GUIDE.md for instructions.'
      };
    }

    try {
      // STEP 1: Check guide's calendar availability (pass slotId to exclude current slot)
      const availabilityCheck = await this.checkGuideAvailability(
        guideEmail,
        tourDetails.startTime,
        tourDetails.endTime,
        slotId,  // Pass slotId to exclude from conflict check
        true     // Skip time range check for calendar invites
      );

      // STEP 2: If calendar conflict, create invitation record and return
      if (!availabilityCheck.available) {
        const invitation = await CalendarInvitation.create({
          slotId,
          slotType: tourDetails.isSubSlot ? 'SubSlot' : 'TimeSlot',
          guideId,
          calendarEventId: null,
          status: 'calendar_conflict',
          invitedAt: new Date(),
          channelId: null,
          resourceId: null,
          expiresAt: null,
          conflictReason: availabilityCheck.reason
        });

        return {
          success: true,
          hasConflict: true,
          conflictReason: availabilityCheck.reason,
          invitationId: invitation._id.toString()
        };
      }

      // STEP 3: Calendar is free, proceed with invite
      // Format date/time for summary (nickname - date and time)
      const startDate = new Date(tourDetails.startTime);
      const formattedDateTime = startDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: this.timezone
      });
      
      const event = {
        summary: `${tourDetails.nickname ? tourDetails.nickname + ' - ' : ''}${formattedDateTime}`,
        description: '',  // Empty description as requested
        location: tourDetails.location || 'TBD',
        start: {
          dateTime: tourDetails.startTime.toISOString(),
          timeZone: this.timezone
        },
        end: {
          dateTime: tourDetails.endTime.toISOString(),
          timeZone: this.timezone
        },
        attendees: [
          { email: guideEmail }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 60 }
          ]
        }
      };

      const eventResponse = await this.calendar.events.insert({
        calendarId: this.calendarId, // Insert into shared calendar
        resource: event,
        sendUpdates: 'all'  // Send email invite to guide
      });

      // STEP 4: Create invitation record FIRST (before webhook registration)
      const invitation = await CalendarInvitation.create({
        slotId,
        slotType: tourDetails.isSubSlot ? 'SubSlot' : 'TimeSlot',
        guideId,
        calendarEventId: eventResponse.data.id,
        status: 'pending',
        invitedAt: new Date(),
        channelId: null,
        resourceId: null,
        expiresAt: null,
        conflictReason: null
      });

      console.log('📝 Invitation created with ID:', invitation._id.toString());

      // STEP 5: Register webhook for real-time updates (after invitation exists)
      try {
        const webhook = await this.registerPushNotification(eventResponse.data.id);
        
        console.log('🔔 Webhook registered, updating invitation...');
        
        // Update invitation with webhook details using findByIdAndUpdate for atomicity
        await CalendarInvitation.findByIdAndUpdate(
          invitation._id,
          {
            channelId: webhook.channelId,
            resourceId: webhook.resourceId,
            expiresAt: webhook.expiresAt
          },
          { new: true }
        );
        
        console.log('✅ Webhook registered and saved successfully:', { 
          invitationId: invitation._id.toString(),
          channelId: webhook.channelId, 
          resourceId: webhook.resourceId, 
          expiresAt: webhook.expiresAt 
        });
      } catch (webhookError) {
        console.error('❌ Failed to register webhook:', webhookError.message);
        console.error('Webhook error details:', webhookError);
        // Continue without webhook - manual checks will still work
      }

      return {
        success: true,
        hasConflict: false,
        invitationId: invitation._id.toString(),
        eventId: eventResponse.data.id
      };
    } catch (error) {
      console.error('\n❌ SEND INVITE ERROR:');
      console.error('=====================================');
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.code);
      console.error('Error Status:', error.status);
      console.error('Error Details:', JSON.stringify(error.errors || [], null, 2));
      console.error('Full Error:', error);
      console.error('=====================================\n');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update an existing calendar event
   * @param {string} eventId - Calendar event ID
   * @param {string} guideEmail - Guide's email
   * @param {Object} assignment - Updated assignment details
   * @returns {Object} { success: boolean, error?: string }
   */
  async updateEvent(eventId, guideEmail, assignment) {
    if (!this.initialized) {
      return { success: false, error: 'Calendar service not initialized' };
    }

    try {
      // Format date/time for summary (nickname - date and time)
      const startDate = new Date(assignment.startTime);
      const formattedDateTime = startDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: this.timezone
      });
      
      const event = {
        summary: `${assignment.nickname || assignment.tourName} - ${formattedDateTime}`,
        description: '',  // Empty description as requested
        location: assignment.location || 'TBD',
        start: {
          dateTime: assignment.startTime.toISOString(),
          timeZone: this.timezone
        },
        end: {
          dateTime: assignment.endTime.toISOString(),
          timeZone: this.timezone
        },
        attendees: [
          { email: guideEmail }
        ]
      };

      await this.calendar.events.update({
        calendarId: this.calendarId,
        eventId: eventId,
        resource: event,
        sendUpdates: 'all'
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating calendar event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a calendar event
   * @param {string} eventId - Calendar event ID
   * @param {string} guideEmail - Guide's email (not used in shared calendar approach)
   * @returns {Object} { success: boolean, error?: string }
   */
  async deleteEvent(eventId, guideEmail) {
    if (!this.initialized) {
      return { success: false, error: 'Calendar service not initialized' };
    }

    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: eventId,
        sendUpdates: 'all'
      });

      return { success: true };
    } catch (error) {
      // If event not found, consider it a success (already deleted)
      if (error.code === 404 || error.message.includes('Not Found')) {
        return { success: true };
      }

      console.error('Error deleting calendar event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop watching a calendar event
   * @param {string} channelId - Channel ID
   * @param {string} resourceId - Resource ID
   * @returns {Object} { success: boolean, error?: string }
   */
  async stopPushNotification(channelId, resourceId) {
    if (!this.initialized) {
      return { success: false, error: 'Calendar service not initialized' };
    }

    try {
      await this.calendar.channels.stop({
        resource: {
          id: channelId,
          resourceId: resourceId
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Error stopping push notification:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Register push notification for calendar event
   * @param {string} eventId - Calendar event ID
   * @returns {Object} { channelId, resourceId, expiresAt }
   */
  async registerPushNotification(eventId) {
    if (!this.initialized) {
      throw new Error('Calendar service not initialized');
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      throw new Error('BACKEND_URL not configured in .env');
    }

    const channelId = `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const webhookUrl = `${backendUrl}/api/calendar/webhook`;

    try {
      const response = await this.calendar.events.watch({
        calendarId: this.calendarId,
        eventId: eventId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl
        }
      });

      return {
        channelId: response.data.id,
        resourceId: response.data.resourceId,
        expiresAt: new Date(parseInt(response.data.expiration))
      };
    } catch (error) {
      console.error('Error registering push notification:', error.message);
      throw error;
    }
  }


  /**
   * Process webhook notification from Google Calendar
   * @param {Object} headers - Request headers
   * @param {Object} body - Request body
   * @returns {Object} { success: boolean, action: string, error?: string }
   */
  async processWebhookNotification(headers, body) {
    try {
      const channelId = headers['x-goog-channel-id'];
      const resourceState = headers['x-goog-resource-state'];

      console.log('🔔 Webhook received:', { channelId, resourceState });

      // Ignore sync messages
      if (resourceState === 'sync') {
        return { success: true, action: 'ignored_sync' };
      }

      // Find invitation by channel ID
      const invitation = await CalendarInvitation.findOne({ channelId }).populate('guideId');
      if (!invitation) {
        console.warn(`⚠️  No invitation found for channel: ${channelId}`);
        
        // Debug: Check if invitation exists with null channelId
        const allInvitations = await CalendarInvitation.find({}).sort({ createdAt: -1 }).limit(5);
        console.log('📋 Recent invitations:', allInvitations.map(inv => ({
          id: inv._id.toString(),
          channelId: inv.channelId,
          status: inv.status,
          createdAt: inv.createdAt
        })));
        
        return { success: true, action: 'no_invitation_found' };
      }

      console.log('✅ Found invitation:', invitation._id.toString());

      // Fetch event from Google to check attendee status
      const event = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId: invitation.calendarEventId
      });

      console.log('📅 Event fetched:', event.data.id);

      // Find guide's response
      const guide = await Guide.findById(invitation.guideId).populate('userId');
      const guideEmail = guide.calendarEmail || guide.email;
      console.log('👤 Looking for guide email:', guideEmail);
      console.log('👥 Event attendees:', event.data.attendees?.map(a => ({ email: a.email, status: a.responseStatus })));
      
      const attendee = event.data.attendees?.find(a => a.email === guideEmail);

      if (!attendee) {
        console.warn('⚠️  No attendee found matching guide email');
        return { success: true, action: 'no_attendee_found' };
      }

      console.log('✅ Attendee found, response status:', attendee.responseStatus);

      // Check response status
      if (attendee.responseStatus === 'accepted') {
        console.log('🎉 Processing acceptance...');
        console.log('🎉 Processing acceptance...');
        // Auto-assign guide
        if (invitation.slotType === 'TimeSlot') {
          console.log('📍 Assigning to TimeSlot:', invitation.slotId);
          const slot = await TimeSlot.findById(invitation.slotId);
          if (slot) {
            slot.assignedGuideId = invitation.guideId;
            slot.assignedGuideName = guide.guideName;
            slot.calendarEventId = invitation.calendarEventId;
            slot.status = 'ASSIGNED';
            await slot.save();
            console.log('✅ TimeSlot assigned successfully');
          } else {
            console.error('❌ TimeSlot not found:', invitation.slotId);
          }
        } else {
          console.log('📍 Assigning to SubSlot:', invitation.slotId);
          const slot = await TimeSlot.findOne({ 'subSlots._id': invitation.slotId });
          if (slot) {
            const subSlot = slot.subSlots.id(invitation.slotId);
            if (subSlot) {
              subSlot.assignedGuideId = invitation.guideId;
              subSlot.assignedGuideName = guide.guideName;
              subSlot.calendarEventId = invitation.calendarEventId;
              subSlot.status = 'ASSIGNED';
              await slot.save();
              console.log('✅ SubSlot assigned successfully');
            } else {
              console.error('❌ SubSlot not found in slot');
            }
          } else {
            console.error('❌ Parent slot not found for SubSlot:', invitation.slotId);
          }
        }

        // Update invitation status
        invitation.status = 'accepted';
        invitation.respondedAt = new Date();
        await invitation.save();
        console.log('✅ Invitation status updated to accepted');

        // Stop watching this event
        await this.stopPushNotification(invitation.channelId, invitation.resourceId);
        console.log('✅ Webhook stopped');

        return { success: true, action: 'accepted_and_assigned' };
      } else if (attendee.responseStatus === 'declined') {
        console.log('❌ Processing rejection...');
        // Update invitation status
        invitation.status = 'rejected';
        invitation.respondedAt = new Date();
        await invitation.save();

        // Stop watching this event
        await this.stopPushNotification(invitation.channelId, invitation.resourceId);

        return { success: true, action: 'rejected' };
      }

      return { success: true, action: 'no_status_change' };
    } catch (error) {
      console.error('Error processing webhook notification:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Manually check invitation status by fetching event from Google Calendar
   * @param {string} invitationId - Invitation ID
   * @returns {Object} { success: boolean, status: string, respondedAt?: Date, error?: string }
   */
  async checkInvitationStatusManually(invitationId) {
    if (!this.initialized) {
      return { success: false, error: 'Calendar service not initialized' };
    }

    try {
      const invitation = await CalendarInvitation.findById(invitationId).populate('guideId');
      
      if (!invitation) {
        return { success: false, error: 'Invitation not found' };
      }

      // If no event (calendar conflict), return current status
      if (!invitation.calendarEventId) {
        return {
          success: true,
          status: invitation.status,
          conflictReason: invitation.conflictReason
        };
      }

      // Fetch event from Google Calendar
      const event = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId: invitation.calendarEventId
      });

      // Find guide's response
      const guide = await Guide.findById(invitation.guideId).populate('userId');
      const guideEmail = guide.calendarEmail || guide.email;
      const attendee = event.data.attendees?.find(a => a.email === guideEmail);

      if (!attendee) {
        return {
          success: true,
          status: invitation.status
        };
      }

      // Check response status and update if changed
      if (attendee.responseStatus === 'accepted' && invitation.status !== 'accepted') {
        
        // Auto-assign guide
        if (invitation.slotType === 'TimeSlot') {
          const slot = await TimeSlot.findById(invitation.slotId);
          if (slot) {
            slot.assignedGuideId = invitation.guideId;
            slot.assignedGuideName = guide.guideName;
            slot.calendarEventId = invitation.calendarEventId;  // Store event ID for deletion
            slot.status = 'ASSIGNED';
            await slot.save();
          }
        } else {
          // Handle SubSlot assignment
          const slot = await TimeSlot.findOne({ 'subSlots._id': invitation.slotId });
          if (slot) {
            const subSlot = slot.subSlots.id(invitation.slotId);
            if (subSlot) {
              subSlot.assignedGuideId = invitation.guideId;
              subSlot.assignedGuideName = guide.guideName;
              subSlot.calendarEventId = invitation.calendarEventId;  // Store event ID for deletion
              subSlot.status = 'ASSIGNED';
              await slot.save();
            }
          }
        }

        // Update invitation status
        invitation.status = 'accepted';
        invitation.respondedAt = new Date();
        await invitation.save();

        return {
          success: true,
          status: 'accepted',
          respondedAt: invitation.respondedAt
        };
      } else if (attendee.responseStatus === 'declined' && invitation.status !== 'rejected') {
        
        // Update invitation status
        invitation.status = 'rejected';
        invitation.respondedAt = new Date();
        await invitation.save();

        return {
          success: true,
          status: 'rejected',
          respondedAt: invitation.respondedAt
        };
      }

      return {
        success: true,
        status: invitation.status,
        respondedAt: invitation.respondedAt
      };
    } catch (error) {
      console.error('❌ Error checking invitation status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build event description from assignment details
   * @private
   */
  _buildEventDescription(assignment) {
    const parts = [
      `Guide: ${assignment.guideName}`,
      assignment.guideTier ? `Tier: ${assignment.guideTier}` : null,
      `Passengers: ${assignment.passengerCount || 'TBD'}`,
      assignment.bookingReference ? `Booking Reference: ${assignment.bookingReference}` : null,
      assignment.specialRequirements ? `Special Requirements: ${assignment.specialRequirements}` : null
    ].filter(Boolean);

    return parts.join('\n');
  }
}

// Create singleton instance
const calendarService = new CalendarService();

export default calendarService;
