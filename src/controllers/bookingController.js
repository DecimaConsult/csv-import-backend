import Booking from '../models/Booking.js';
import ActivityBooking from '../models/ActivityBooking.js';
import mongoose from 'mongoose';

/**
 * Booking Controller
 * Handles HTTP requests for booking queries
 */

/**
 * Get bookings with optional filters
 * GET /api/bookings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getBookings = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.query;
    
    // If slotId is provided, get activity bookings for that slot
    if (slotId) {
      // Validate slotId
      if (!mongoose.Types.ObjectId.isValid(slotId)) {
        return res.status(400).json({ 
          error: 'Invalid slot ID format' 
        });
      }
      
      // Build query filter
      const filter = { slotId: slotId };
      
      // Add sub-slot filter if provided
      if (subSlotId) {
        filter.subSlotId = subSlotId;
      }
      
      // Find activity bookings for this slot (and optionally sub-slot)
      const activityBookings = await ActivityBooking.find(filter)
        .sort({ bookingId: 1 })
        .lean();
      
      // Get parent booking details for each activity booking
      const bookingsWithDetails = await Promise.all(
        activityBookings.map(async (activityBooking) => {
          const parentBooking = await Booking.findOne({ 
            bookingId: activityBooking.parentBookingId 
          }).lean();
          
          return {
            _id: activityBooking._id,
            activityBookingId: activityBooking.bookingId,
            confirmationCode: activityBooking.confirmationCode || parentBooking?.confirmationCode,
            productConfirmationCode: activityBooking.productConfirmationCode,
            externalBookingReference: parentBooking?.externalBookingReference,
            
            // Customer information
            customerName: parentBooking ? `${parentBooking.firstName} ${parentBooking.lastName}` : 'Unknown',
            firstName: parentBooking?.firstName,
            lastName: parentBooking?.lastName,
            email: parentBooking?.email,
            phone: parentBooking?.phoneNumber,
            phoneNumberLinkable: parentBooking?.phoneNumberLinkable,
            
            // Booking status and dates
            status: activityBooking.status,
            creationDate: parentBooking?.creationDate,
            
            // Product information
            productTitle: activityBooking.productTitle,
            productId: activityBooking.productId,
            externalProductId: activityBooking.externalProductId,
            rateTitle: activityBooking.rateTitle,
            startDateTime: activityBooking.startDateTime,
            endDateTime: activityBooking.endDateTime,
            
            // Pricing information
            totalPrice: activityBooking.totalPrice,
            priceWithDiscount: activityBooking.priceWithDiscount,
            currency: activityBooking.currency || parentBooking?.currency,
            
            // Parent booking pricing
            parentTotalPrice: parentBooking?.totalPrice,
            parentTotalPaid: parentBooking?.totalPaid,
            parentTotalDue: parentBooking?.totalDue,
            paymentType: parentBooking?.paymentType,
            
            // Passenger information
            totalPassengers: activityBooking.totalPassengers,
            totalAdults: activityBooking.totalAdults,
            totalYouth: activityBooking.totalYouth,
            totalChildren: activityBooking.totalChildren,
            totalInfants: activityBooking.totalInfants,
            passengers: activityBooking.passengers,
            
            // Booking source and channel
            bookingSource: activityBooking.bookingSource,
            bookingChannelTitle: parentBooking?.bookingChannelTitle,
            sellerTitle: parentBooking?.sellerTitle,
            
            // Supplier information
            supplierTitle: activityBooking.supplierTitle,
            supplierEmail: activityBooking.supplierEmail,
            supplierPhone: activityBooking.supplierPhone,
            
            // Additional details
            selectedOptions: activityBooking.selectedOptions,
            parentBookingId: activityBooking.parentBookingId,
            checkInStatus: activityBooking.checkInStatus ? activityBooking.checkInStatus : null
          };
        })
      );
      
      // Ensure checkInStatus is included even if null
      const bookingsWithCheckInStatus = bookingsWithDetails.map(b => ({
        ...b,
        checkInStatus: b.checkInStatus || null
      }));
      
      return res.status(200).json({ 
        bookings: bookingsWithCheckInStatus,
        count: bookingsWithCheckInStatus.length,
        slotId: slotId
      });
    }
    
    // If no slotId, return all bookings (could add pagination here)
    const bookings = await Booking.find()
      .sort({ creationDate: -1 })
      .limit(100) // Limit to prevent overwhelming response
      .lean();
    
    res.status(200).json({ 
      bookings,
      count: bookings.length,
      message: bookings.length === 0 ? 'No bookings found' : undefined
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Get booking details by ID
 * GET /api/bookings/:bookingId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Parse bookingId as number (Bokun booking IDs are numbers)
    const numericBookingId = parseInt(bookingId);
    
    if (isNaN(numericBookingId)) {
      return res.status(400).json({ 
        error: 'Invalid booking ID format. Booking ID must be a number.' 
      });
    }
    
    // Find booking by bookingId (not MongoDB _id)
    const booking = await Booking.findOne({ 
      bookingId: numericBookingId 
    }).lean();
    
    if (!booking) {
      return res.status(404).json({ 
        error: 'Booking not found' 
      });
    }
    
    // Get all activity bookings for this booking
    const activityBookings = await ActivityBooking.find({ 
      parentBookingId: numericBookingId 
    })
      .populate('slotId', 'productTitle startDateTime endDateTime currentPassengerCount maxCapacity assignedGuideName status')
      .populate('guideId', 'guideName email phoneNumber')
      .sort({ startDateTime: 1 })
      .lean();
    
    // Combine booking with activity bookings
    const fullBookingDetails = {
      ...booking,
      activityBookings: activityBookings.map(ab => ({
        activityBookingId: ab.bookingId,
        confirmationCode: ab.confirmationCode,
        productConfirmationCode: ab.productConfirmationCode,
        status: ab.status,
        productId: ab.productId,
        productTitle: ab.productTitle,
        startDateTime: ab.startDateTime,
        endDateTime: ab.endDateTime,
        durationHours: ab.durationHours,
        durationMinutes: ab.durationMinutes,
        totalPrice: ab.totalPrice,
        currency: ab.currency,
        totalPassengers: ab.totalPassengers,
        totalAdults: ab.totalAdults,
        totalChildren: ab.totalChildren,
        totalInfants: ab.totalInfants,
        passengers: ab.passengers,
        slot: ab.slotId,
        guide: ab.guideId,
        supplierTitle: ab.supplierTitle,
        supplierEmail: ab.supplierEmail,
        supplierPhone: ab.supplierPhone,
        included: ab.included,
        excluded: ab.excluded,
        attention: ab.attention,
        description: ab.description
      }))
    };
    
    res.status(200).json({ 
      booking: fullBookingDetails
    });
  } catch (error) {
    console.error('Get booking by ID error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Import booking from Bokun by confirmation code
 * POST /api/bookings/import
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const importBooking = async (req, res) => {
  try {
    const { confirmationCode } = req.body;

    // Validate confirmation code
    if (!confirmationCode || typeof confirmationCode !== 'string') {
      return res.status(400).json({ 
        error: 'Confirmation code is required' 
      });
    }

    // Trim and validate format (e.g., VIA-70887957)
    const trimmedCode = confirmationCode.trim();
    if (trimmedCode.length === 0) {
      return res.status(400).json({ 
        error: 'Confirmation code cannot be empty' 
      });
    }

    console.log(`📥 Importing booking: ${trimmedCode}`);

    // Import services
    const BokunApiService = (await import('../services/bokunApiService.js')).default;
    const WebhookService = (await import('../services/webhookService.js')).default;

    // Fetch booking from Bokun API
    let bookingData;
    try {
      bookingData = await BokunApiService.fetchBookingByConfirmationCode(trimmedCode);
    } catch (apiError) {
      console.error('Bokun API error:', apiError.message);
      return res.status(400).json({ 
        error: apiError.message,
        confirmationCode: trimmedCode
      });
    }

    // Check if booking already exists
    const existingBooking = await Booking.findOne({ 
      bookingId: bookingData.bookingId 
    });

    const isUpdate = !!existingBooking;

    // Process booking using webhook service (reuses existing logic)
    const mockHeaders = {
      'x-bokun-topic': bookingData.status === 'CANCELLED' ? 'bookings/cancel' : 'bookings/create',
      'x-bokun-booking-id': String(bookingData.bookingId),
    };

    await WebhookService.processWebhook(mockHeaders, bookingData, 0);

    // Fetch the processed booking to return details
    const processedBooking = await Booking.findOne({ 
      bookingId: bookingData.bookingId 
    }).lean();

    const activityBookings = await ActivityBooking.find({ 
      parentBookingId: bookingData.bookingId 
    })
      .populate('slotId', 'productTitle startDateTime endDateTime subSlots')
      .lean();

    // Build response with booking details
    const response = {
      success: true,
      isUpdate,
      message: isUpdate 
        ? `Booking ${trimmedCode} updated successfully` 
        : `Booking ${trimmedCode} imported successfully`,
      booking: {
        confirmationCode: processedBooking.confirmationCode,
        bookingId: processedBooking.bookingId,
        customerName: `${processedBooking.firstName} ${processedBooking.lastName}`,
        email: processedBooking.email,
        status: processedBooking.status,
        totalPrice: processedBooking.totalPrice,
        currency: processedBooking.currency,
        activityBookings: activityBookings.map(ab => {
          // Find the assigned sub-slot
          const slot = ab.slotId;
          const subSlot = slot?.subSlots?.find(ss => ss.subSlotId === ab.subSlotId);

          return {
            productTitle: ab.productTitle,
            startDateTime: ab.startDateTime,
            totalPassengers: ab.totalPassengers,
            status: ab.status,
            slotInfo: slot ? {
              slotId: slot._id,
              productTitle: slot.productTitle,
              startDateTime: slot.startDateTime,
              subSlotId: ab.subSlotId,
              subSlotLabel: subSlot?.label || ab.subSlotId,
              currentPassengers: subSlot?.currentPassengerCount || 0,
              maxCapacity: subSlot?.maxCapacity || 0
            } : null
          };
        })
      }
    };

    console.log(`✅ Booking ${trimmedCode} ${isUpdate ? 'updated' : 'imported'} successfully`);

    res.status(200).json(response);

  } catch (error) {
    console.error('Import booking error:', error);
    res.status(500).json({ 
      error: 'Failed to import booking',
      message: error.message 
    });
  }
};

export default {
  getBookings,
  getBookingById,
  importBooking
};
