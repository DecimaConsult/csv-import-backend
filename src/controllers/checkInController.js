import ActivityBooking from '../models/ActivityBooking.js';
import TimeSlot from '../models/TimeSlot.js';
import mongoose from 'mongoose';
import { logger, ErrorCategory } from '../utils/errorLogger.js';
import { CheckInError, ValidationError, NotFoundError, AuthorizationError } from '../utils/customErrors.js';

/**
 * POST /api/check-in/booking
 * Check in an entire booking (all passengers at once)
 * Body:
 *   - bookingId: MongoDB ObjectId of the booking
 * Returns: Updated booking with check-in status
 * Auth: GUIDE or ADMIN
 */
export const checkInBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    // Validate required fields
    if (!bookingId) {
      throw new ValidationError('Missing required field: bookingId is required');
    }

    // Validate bookingId format
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new ValidationError('Invalid bookingId format');
    }

    // Find the booking
    const booking = await ActivityBooking.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Booking');
    }

    // Check if booking is cancelled
    if (booking.status === 'CANCELLED') {
      throw new CheckInError('Cannot check in a cancelled booking');
    }

    // Check if booking is already checked in
    if (booking.checkInStatus && booking.checkInStatus.isCheckedIn) {
      throw new CheckInError(
        `Booking is already checked in at ${booking.checkInStatus.checkedInAt} by ${booking.checkInStatus.checkedInByName}`
      );
    }

    // For guides, verify they are assigned to this sub-slot
    // COORDINATOR and ADMIN can access any slot
    if (req.user.role === 'GUIDE') {
      const Guide = mongoose.model('Guide');
      const guide = await Guide.findOne({ userId: req.user.id });

      if (!guide) {
        throw new NotFoundError('Guide profile');
      }

      const timeSlot = await TimeSlot.findById(booking.slotId);

      if (!timeSlot) {
        throw new NotFoundError('Time slot');
      }

      // Check if guide is assigned to this sub-slot OR to the root slot
      let isAssigned = false;

      if (booking.subSlotId && timeSlot.subSlots && timeSlot.subSlots.length > 0) {
        // Check if guide is assigned to the specific sub-slot
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === booking.subSlotId);
        if (subSlot && subSlot.assignedGuideId && subSlot.assignedGuideId.toString() === guide._id.toString()) {
          isAssigned = true;
        }
      }
      
      // Also check if guide is assigned at root level (can manage all sub-slots)
      if (!isAssigned && timeSlot.assignedGuideId && timeSlot.assignedGuideId.toString() === guide._id.toString()) {
        isAssigned = true;
      }

      if (!isAssigned) {
        throw new AuthorizationError('You are not assigned to this tour');
      }
    }

    // Update check-in status using updateOne with retry logic for race conditions
    let updateResult;
    let retries = 3;
    
    while (retries > 0) {
      try {
        updateResult = await ActivityBooking.updateOne(
          { 
            _id: bookingId,
            // Ensure booking hasn't been checked in by another request
            'checkInStatus.isCheckedIn': { $ne: true }
          },
          {
            $set: {
              checkInStatus: {
                isCheckedIn: true,
                checkedInAt: new Date(),
                checkedInBy: req.user.id,
                checkedInByName: req.user.name
              }
            }
          }
        );
        
        break; // Success, exit retry loop
      } catch (dbError) {
        retries--;
        if (retries === 0) {
          throw dbError;
        }
        
        logger.warn(ErrorCategory.CHECK_IN, 
          `Database error during check-in, retrying... (${3 - retries}/3)`,
          { error: dbError, bookingId }
        );
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (updateResult.modifiedCount === 0) {
      // Check if booking was already checked in by concurrent request
      const currentBooking = await ActivityBooking.findById(bookingId);
      if (currentBooking?.checkInStatus?.isCheckedIn) {
        throw new CheckInError(
          `Booking was already checked in by ${currentBooking.checkInStatus.checkedInByName} at ${currentBooking.checkInStatus.checkedInAt}`
        );
      }
      
      logger.error(ErrorCategory.CHECK_IN, 'Failed to update booking check-in status', {
        bookingId,
        updateResult
      });
      throw new CheckInError('Failed to update booking check-in status');
    }

    // Fetch the updated booking
    const updatedBooking = await ActivityBooking.findById(bookingId);

    if (!updatedBooking) {
      throw new NotFoundError('Updated booking');
    }

    logger.info(ErrorCategory.CHECK_IN, 'Booking checked in successfully', {
      bookingId: updatedBooking.bookingId,
      checkedInBy: req.user.name,
      totalPassengers: updatedBooking.totalPassengers
    });

    res.json({
      success: true,
      message: 'Booking checked in successfully',
      booking: {
        _id: updatedBooking._id,
        bookingId: updatedBooking.bookingId,
        confirmationCode: updatedBooking.confirmationCode,
        productConfirmationCode: updatedBooking.productConfirmationCode,
        totalPassengers: updatedBooking.totalPassengers,
        checkInStatus: updatedBooking.checkInStatus
      }
    });
  } catch (error) {
    logger.error(ErrorCategory.CHECK_IN, 'Error checking in booking', {
      error,
      bookingId: req.body.bookingId,
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * LEGACY: POST /api/check-in/passenger
 * Check in a single passenger (kept for backward compatibility)
 * Body:
 *   - bookingId: MongoDB ObjectId of the booking
 *   - passengerIndex: Index of the passenger in the passengers array
 * Returns: Updated booking with check-in status
 * Auth: GUIDE or ADMIN
 * 
 * NOTE: This endpoint is deprecated. Use /api/check-in/booking instead.
 */
export const checkInPassenger = async (req, res) => {
  try {
    const { bookingId, passengerIndex } = req.body;

    if (!bookingId || passengerIndex === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: bookingId and passengerIndex are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        error: 'Invalid bookingId format'
      });
    }

    if (typeof passengerIndex !== 'number' || passengerIndex < 0) {
      return res.status(400).json({
        error: 'passengerIndex must be a non-negative number'
      });
    }

    const booking = await ActivityBooking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        error: 'Booking not found'
      });
    }

    if (passengerIndex >= booking.passengers.length) {
      return res.status(400).json({
        error: `Passenger at index ${passengerIndex} does not exist. Booking has ${booking.passengers.length} passengers.`
      });
    }

    const passenger = booking.passengers[passengerIndex];

    if (passenger.checkInStatus && passenger.checkInStatus.isCheckedIn) {
      return res.status(400).json({
        error: 'Passenger is already checked in',
        checkedInAt: passenger.checkInStatus.checkedInAt,
        checkedInBy: passenger.checkInStatus.checkedInByName
      });
    }

    // For guides, verify assignment
    if (req.user.role === 'GUIDE') {
      const Guide = mongoose.model('Guide');
      const guide = await Guide.findOne({ userId: req.user.id });

      if (!guide) {
        return res.status(404).json({
          error: 'Guide profile not found'
        });
      }

      const timeSlot = await TimeSlot.findById(booking.slotId);

      if (!timeSlot) {
        return res.status(404).json({
          error: 'Time slot not found'
        });
      }

      let isAssigned = false;

      if (booking.subSlotId && timeSlot.subSlots && timeSlot.subSlots.length > 0) {
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === booking.subSlotId);
        if (subSlot && subSlot.assignedGuideId && subSlot.assignedGuideId.toString() === guide._id.toString()) {
          isAssigned = true;
        }
      } else if (timeSlot.assignedGuideId && timeSlot.assignedGuideId.toString() === guide._id.toString()) {
        isAssigned = true;
      }

      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this tour'
        });
      }
    }

    passenger.checkInStatus = {
      isCheckedIn: true,
      checkedInAt: new Date(),
      checkedInBy: req.user.id,
      checkedInByName: req.user.name
    };

    await booking.save();

    res.json({
      message: 'Passenger checked in successfully',
      booking: {
        _id: booking._id,
        bookingId: booking.bookingId,
        confirmationCode: booking.confirmationCode,
        passenger: {
          index: passengerIndex,
          firstName: passenger.passengerInfo?.firstName,
          lastName: passenger.passengerInfo?.lastName,
          category: passenger.category,
          checkInStatus: passenger.checkInStatus
        }
      }
    });
  } catch (error) {
    console.error('Error checking in passenger:', error);
    res.status(500).json({
      error: 'Failed to check in passenger',
      details: error.message
    });
  }
};

/**
 * GET /api/check-in/slot/:slotId/sub-slot/:subSlotId
 * Get check-in status for all bookings in a sub-slot
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 *   - subSlotId: Sub-slot identifier (e.g., "A", "B", "C")
 * Returns: Array of bookings with check-in status
 * Auth: GUIDE (assigned only) or ADMIN
 */
export const getSubSlotCheckInStatus = async (req, res) => {
  try {
    const { slotId, subSlotId } = req.params;

    // Validate slotId format
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({
        error: 'Invalid slotId format'
      });
    }

    // Validate subSlotId is provided
    if (!subSlotId) {
      return res.status(400).json({
        error: 'subSlotId is required'
      });
    }

    // Find the time slot
    const timeSlot = await TimeSlot.findById(slotId);

    if (!timeSlot) {
      return res.status(404).json({
        error: 'Time slot not found'
      });
    }

    // For guides, verify they are assigned to this sub-slot OR to the root slot
    if (req.user.role === 'GUIDE') {
      const Guide = mongoose.model('Guide');
      const guide = await Guide.findOne({ userId: req.user.id });

      if (!guide) {
        return res.status(404).json({
          error: 'Guide profile not found'
        });
      }

      let isAssigned = false;

      // Check if guide is assigned to the specific sub-slot
      if (timeSlot.subSlots && timeSlot.subSlots.length > 0) {
        const subSlot = timeSlot.subSlots.find(ss => ss.subSlotId === subSlotId);
        if (subSlot && subSlot.assignedGuideId && subSlot.assignedGuideId.toString() === guide._id.toString()) {
          isAssigned = true;
        }
      }

      // Also check if guide is assigned at root level (can manage all sub-slots)
      if (!isAssigned && timeSlot.assignedGuideId && timeSlot.assignedGuideId.toString() === guide._id.toString()) {
        isAssigned = true;
      }

      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this sub-slot or tour'
        });
      }
    }

    // Find all bookings for this sub-slot
    const bookings = await ActivityBooking.find({
      slotId: slotId,
      subSlotId: subSlotId,
      status: { $ne: 'CANCELLED' }
    }).sort({ createdAt: 1 });

    // Format the response with booking-level check-in status
    const checkInData = bookings.map(booking => ({
      bookingId: booking._id,
      confirmationCode: booking.confirmationCode,
      productConfirmationCode: booking.productConfirmationCode,
      totalPassengers: booking.totalPassengers,
      totalAdults: booking.totalAdults,
      totalYouth: booking.totalYouth,
      totalChildren: booking.totalChildren,
      isCheckedIn: booking.checkInStatus?.isCheckedIn || false,
      checkedInAt: booking.checkInStatus?.checkedInAt || null,
      checkedInBy: booking.checkInStatus?.checkedInByName || null,
      passengers: booking.passengers.map((passenger, index) => ({
        index: index,
        firstName: passenger.passengerInfo?.firstName || 'N/A',
        lastName: passenger.passengerInfo?.lastName || 'N/A',
        category: passenger.category,
        quantity: passenger.quantity
      }))
    }));

    // Calculate summary statistics based on booking-level check-in
    const totalPassengers = bookings.reduce((sum, booking) =>
      sum + (booking.totalPassengers || 0), 0
    );

    const checkedInPassengers = bookings.reduce((sum, booking) =>
      sum + (booking.checkInStatus?.isCheckedIn ? (booking.totalPassengers || 0) : 0), 0
    );

    const totalBookings = bookings.length;
    const checkedInBookings = bookings.filter(b => b.checkInStatus?.isCheckedIn).length;

    res.json({
      slotId: slotId,
      subSlotId: subSlotId,
      productTitle: timeSlot.productTitle,
      startDateTime: timeSlot.startDateTime,
      summary: {
        totalPassengers: totalPassengers,
        checkedInPassengers: checkedInPassengers,
        pendingPassengers: totalPassengers - checkedInPassengers,
        checkInPercentage: totalPassengers > 0 ? Math.round((checkedInPassengers / totalPassengers) * 100) : 0,
        totalBookings: totalBookings,
        checkedInBookings: checkedInBookings,
        pendingBookings: totalBookings - checkedInBookings
      },
      bookings: checkInData
    });
  } catch (error) {
    console.error('Error fetching check-in status:', error);
    res.status(500).json({
      error: 'Failed to fetch check-in status',
      details: error.message
    });
  }
};

/**
 * GET /api/check-in/slot/:slotId
 * Get check-in status for all bookings in a time slot (for non-sub-slot products)
 * Params:
 *   - slotId: MongoDB ObjectId of the time slot
 * Returns: Array of bookings with check-in status
 * Auth: GUIDE (assigned only) or ADMIN
 */
export const getSlotCheckInStatus = async (req, res) => {
  try {
    const { slotId } = req.params;

    // Validate slotId format
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({
        error: 'Invalid slotId format'
      });
    }

    // Find the time slot
    const timeSlot = await TimeSlot.findById(slotId);

    if (!timeSlot) {
      return res.status(404).json({
        error: 'Time slot not found'
      });
    }

    // For guides, verify they are assigned to this slot OR to any sub-slot
    if (req.user.role === 'GUIDE') {
      const Guide = mongoose.model('Guide');
      const guide = await Guide.findOne({ userId: req.user.id });

      if (!guide) {
        return res.status(404).json({
          error: 'Guide profile not found'
        });
      }

      let isAssigned = false;

      // Check if guide is assigned at root level
      if (timeSlot.assignedGuideId && timeSlot.assignedGuideId.toString() === guide._id.toString()) {
        isAssigned = true;
      }

      // Also check if guide is assigned to any sub-slot
      if (!isAssigned && timeSlot.subSlots && timeSlot.subSlots.length > 0) {
        isAssigned = timeSlot.subSlots.some(subSlot => 
          subSlot.assignedGuideId && subSlot.assignedGuideId.toString() === guide._id.toString()
        );
      }

      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this slot or any of its sub-slots'
        });
      }
    }

    // Find all bookings for this slot
    // If the slot requires sub-slots and guide is assigned at root level,
    // fetch ALL bookings across all sub-slots
    const bookings = await ActivityBooking.find({
      slotId: slotId,
      status: { $ne: 'CANCELLED' }
    }).sort({ createdAt: 1 });

    // Format the response with booking-level check-in status
    const checkInData = bookings.map(booking => ({
      bookingId: booking._id,
      confirmationCode: booking.confirmationCode,
      productConfirmationCode: booking.productConfirmationCode,
      totalPassengers: booking.totalPassengers,
      totalAdults: booking.totalAdults,
      totalYouth: booking.totalYouth,
      totalChildren: booking.totalChildren,
      isCheckedIn: booking.checkInStatus?.isCheckedIn || false,
      checkedInAt: booking.checkInStatus?.checkedInAt || null,
      checkedInBy: booking.checkInStatus?.checkedInByName || null,
      passengers: booking.passengers.map((passenger, index) => ({
        index: index,
        firstName: passenger.passengerInfo?.firstName || 'N/A',
        lastName: passenger.passengerInfo?.lastName || 'N/A',
        category: passenger.category,
        quantity: passenger.quantity
      }))
    }));

    // Calculate summary statistics based on booking-level check-in
    const totalPassengers = bookings.reduce((sum, booking) =>
      sum + (booking.totalPassengers || 0), 0
    );

    const checkedInPassengers = bookings.reduce((sum, booking) =>
      sum + (booking.checkInStatus?.isCheckedIn ? (booking.totalPassengers || 0) : 0), 0
    );

    const totalBookings = bookings.length;
    const checkedInBookings = bookings.filter(b => b.checkInStatus?.isCheckedIn).length;

    res.json({
      slotId: slotId,
      productTitle: timeSlot.productTitle,
      startDateTime: timeSlot.startDateTime,
      summary: {
        totalPassengers: totalPassengers,
        checkedInPassengers: checkedInPassengers,
        pendingPassengers: totalPassengers - checkedInPassengers,
        checkInPercentage: totalPassengers > 0 ? Math.round((checkedInPassengers / totalPassengers) * 100) : 0,
        totalBookings: totalBookings,
        checkedInBookings: checkedInBookings,
        pendingBookings: totalBookings - checkedInBookings
      },
      bookings: checkInData
    });
  } catch (error) {
    console.error('Error fetching check-in status:', error);
    res.status(500).json({
      error: 'Failed to fetch check-in status',
      details: error.message
    });
  }
};
