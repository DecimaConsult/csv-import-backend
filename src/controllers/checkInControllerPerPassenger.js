/**
 * LEGACY: Per-Passenger Check-In Controller
 * 
 * This is the original per-passenger check-in implementation.
 * Kept as backup in case we need to revert to per-passenger check-in.
 * 
 * DO NOT USE - Use checkInController.js instead for booking-level check-in
 */

import ActivityBooking from '../models/ActivityBooking.js';
import TimeSlot from '../models/TimeSlot.js';
import mongoose from 'mongoose';

/**
 * POST /api/check-in/passenger (LEGACY)
 * Check in a single passenger
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

export default {
  checkInPassenger
};
