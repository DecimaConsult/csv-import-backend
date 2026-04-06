import mongoose from 'mongoose';
import TimeSlot from '../models/TimeSlot.js';
import ActivityBooking from '../models/ActivityBooking.js';
import Product from '../models/Product.js';
import Coordinator from '../models/Coordinator.js';
import { filterBookingData } from '../middleware/roleBasedFilter.js';

/**
 * GET /api/dashboard/admin/upcoming
 * Get upcoming departures separated into next 10 days and remaining
 * Sorted by date ascending, grouped by product within date sections
 * Implements pagination with 50 items per page
 */
export const getAdminUpcomingDepartures = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const now = new Date();
    const tenDaysFromNow = new Date(now);
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
    tenDaysFromNow.setHours(23, 59, 59, 999);

    // For coordinators, filter by assigned products
    let productFilter = {};
    if (req.user.role === 'COORDINATOR') {
      const coordinator = await Coordinator.findOne({ userId: req.user.id });
      if (coordinator && coordinator.assignedProducts.length > 0) {
        productFilter = { productId: { $in: coordinator.assignedProducts } };
      } else {
        // Coordinator with no products assigned sees nothing
        return res.status(200).json({
          success: true,
          data: {
            next10Days: [],
            remaining: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: limit,
              hasNextPage: false,
              hasPrevPage: false
            },
            summary: {
              next10DaysTotal: 0,
              remainingTotal: 0,
              totalSlots: 0
            }
          }
        });
      }
    }

    // Get all upcoming slots sorted by date
    const allSlots = await TimeSlot.find({
      startDateTime: { $gte: now },
      ...productFilter
    })
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .sort({ startDateTime: 1 })
      .lean();

    // Get product nicknames and names
    const productIds = [...new Set(allSlots.map(s => String(s.productId)))];
    const products = await Product.find({ productId: { $in: productIds } })
      .select('productId nickname name')
      .lean();
    
    const productMap = products.reduce((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {});

    // Enrich slots with product nicknames and names
    allSlots.forEach(slot => {
      const product = productMap[String(slot.productId)];
      if (product) {
        slot.productNickname = product.nickname;
        if (!slot.productTitle) {
          slot.productTitle = product.name;
        }
      }
    });

    // Separate into next 10 days and remaining
    const next10Days = [];
    const remaining = [];

    allSlots.forEach(slot => {
      if (slot.startDateTime <= tenDaysFromNow) {
        next10Days.push(slot);
      } else {
        remaining.push(slot);
      }
    });

    // Group by date and product
    const groupByDateAndProduct = (slots) => {
      const grouped = {};
      
      slots.forEach(slot => {
        const dateKey = slot.startDateTime.toISOString().split('T')[0];
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = {};
        }
        
        // Admin should see full product title, not nickname
        const productKey = slot.productTitle || `Product ${slot.productId}`;
        
        if (!grouped[dateKey][productKey]) {
          grouped[dateKey][productKey] = [];
        }
        
        grouped[dateKey][productKey].push(slot);
      });
      
      return grouped;
    };

    const next10DaysGrouped = groupByDateAndProduct(next10Days);
    const remainingGrouped = groupByDateAndProduct(remaining);

    // Flatten for pagination
    const flattenGrouped = (grouped) => {
      const flattened = [];
      Object.keys(grouped).sort().forEach(date => {
        Object.keys(grouped[date]).sort().forEach(product => {
          flattened.push({
            date,
            product,
            slots: grouped[date][product]
          });
        });
      });
      return flattened;
    };

    const next10DaysFlat = flattenGrouped(next10DaysGrouped);
    const remainingFlat = flattenGrouped(remainingGrouped);

    // Combine for pagination
    const allFlat = [...next10DaysFlat, ...remainingFlat];
    const totalItems = allFlat.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedData = allFlat.slice(skip, skip + limit);

    // Determine which section each item belongs to
    const next10DaysCount = next10DaysFlat.length;
    const responseData = paginatedData.map((item, index) => {
      const absoluteIndex = skip + index;
      return {
        ...item,
        section: absoluteIndex < next10DaysCount ? 'next10Days' : 'remaining'
      };
    });

    res.status(200).json({
      success: true,
      data: {
        next10Days: responseData.filter(item => item.section === 'next10Days'),
        remaining: responseData.filter(item => item.section === 'remaining'),
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        summary: {
          next10DaysTotal: next10Days.length,
          remainingTotal: remaining.length,
          totalSlots: allSlots.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin upcoming departures:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch upcoming departures' 
    });
  }
};

/**
 * GET /api/dashboard/admin/calendar/:date
 * Get all time slots for a specific date
 * Optional query param: productId to filter by product
 */
export const getAdminCalendarDate = async (req, res) => {
  try {
    const { date } = req.params;
    const { productId, showCompleted } = req.query;

    // Parse date and create date range for the entire day
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Build query
    const query = {
      startDateTime: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    };

    // Filter by completed/upcoming
    if (showCompleted === 'true') {
      query.endDateTime = { $lt: new Date() };
    } else {
      query.endDateTime = { $gte: new Date() };
    }

    // For coordinators, filter by assigned products
    if (req.user.role === 'COORDINATOR') {
      const coordinator = await Coordinator.findOne({ userId: req.user.id });
      if (coordinator && coordinator.assignedProducts.length > 0) {
        query.productId = { $in: coordinator.assignedProducts };
      } else {
        // Coordinator with no products assigned sees nothing
        return res.status(200).json({
          success: true,
          data: {
            date: targetDate.toISOString().split('T')[0],
            products: [],
            totalSlots: 0
          }
        });
      }
    } else if (productId) {
      query.productId = parseInt(productId);
    }

    // Fetch slots with populated guide information
    const slots = await TimeSlot.find(query)
      .populate('assignedGuideId', 'firstName lastName email')
      .populate('subSlots.assignedGuideId', 'firstName lastName email')
      .sort({ startDateTime: 1 })
      .lean();

    // Get product nicknames
    const productIds = [...new Set(slots.map(s => String(s.productId)))];
    const products = await Product.find({ productId: { $in: productIds } })
      .select('productId nickname name')
      .lean();
    
    const productMap = products.reduce((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {});

    // Add product nicknames to slots
    slots.forEach(slot => {
      const product = productMap[String(slot.productId)];
      if (product) {
        slot.productNickname = product.nickname;
        if (!slot.productTitle) {
          slot.productTitle = product.name;
        }
      }
    });

    // Group by product
    const groupedByProduct = {};
    slots.forEach(slot => {
      const productKey = slot.productTitle || `Product ${slot.productId}`;
      
      if (!groupedByProduct[productKey]) {
        groupedByProduct[productKey] = {
          productId: slot.productId,
          productTitle: slot.productTitle,
          slots: []
        };
      }
      
      groupedByProduct[productKey].slots.push(slot);
    });

    res.status(200).json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        products: Object.values(groupedByProduct),
        totalSlots: slots.length
      }
    });
  } catch (error) {
    console.error('Error fetching calendar date data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch calendar data' 
    });
  }
};

/**
 * GET /api/dashboard/guide/assigned
 * Get guide's assigned sub-slots OR coordinator's product tours
 * - Guides: Only shows sub-slots assigned to the authenticated guide
 * - Coordinators: Shows all tours for their assigned products
 */
export const getGuideAssignedTours = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let slots = [];
    
    // Handle COORDINATOR role
    if (userRole === 'COORDINATOR') {
      const coordinator = await Coordinator.findOne({ userId });
      
      if (!coordinator) {
        return res.status(404).json({
          success: false,
          error: 'Coordinator profile not found'
        });
      }

      // If coordinator has assigned products, filter by them
      // If no products assigned, show nothing
      if (coordinator.assignedProducts.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            assignedTours: [],
            totalAssignments: 0
          }
        });
      }

      // Find all upcoming slots for coordinator's assigned products
      slots = await TimeSlot.find({
        productId: { $in: coordinator.assignedProducts },
        startDateTime: { $gte: new Date() }
      })
        .populate('assignedGuideId', 'firstName lastName email')
        .populate('subSlots.assignedGuideId', 'firstName lastName email')
        .sort({ startDateTime: 1 })
        .lean();
    } 
    // Handle GUIDE role
    else {
      // First, find the Guide document for this user
      const Guide = mongoose.model('Guide');
      const guide = await Guide.findOne({ userId });
      
      if (!guide) {
        return res.status(404).json({
          success: false,
          error: 'Guide profile not found'
        });
      }

      const guideId = guide._id;

      // Find all slots where the guide is assigned (either root-level or in sub-slots)
      slots = await TimeSlot.find({
        $or: [
          { assignedGuideId: guideId },
          { 'subSlots.assignedGuideId': guideId }
        ],
        startDateTime: { $gte: new Date() }
      })
        .sort({ startDateTime: 1 })
        .lean();
    }

    // Get product nicknames
    const productIds = [...new Set(slots.map(s => String(s.productId)))];
    const products = await Product.find({ productId: { $in: productIds } })
      .select('productId nickname')
      .lean();
    
    const productNicknameMap = {};
    products.forEach(p => {
      if (p.nickname) {
        productNicknameMap[p.productId] = p.nickname;
      }
    });

    // Filter and format the response
    const assignedTours = [];

    for (const slot of slots) {
      // For COORDINATORS: Show all slots and sub-slots for their products
      if (userRole === 'COORDINATOR') {
        // Add root-level slot
        try {
          const bookings = await ActivityBooking.find({ 
            slotId: slot._id,
            status: { $ne: 'CANCELLED' }
          })
            .select('passengers totalPassengers totalAdults totalYouth totalChildren')
            .lean();

          assignedTours.push({
            slotId: slot._id,
            subSlotId: null,
            productId: slot.productId,
            productTitle: slot.productTitle,
            productNickname: productNicknameMap[String(slot.productId)] || null,
            startDateTime: slot.startDateTime,
            endDateTime: slot.endDateTime,
            passengerCount: slot.currentPassengerCount,
            passengerBreakdown: {
              adults: slot.ticketCostCalculation?.adults?.count || 0,
              youth: slot.ticketCostCalculation?.youth?.count || 0,
              children: slot.ticketCostCalculation?.children?.count || 0
            },
            ticketCost: slot.ticketCostCalculation,
            status: slot.status,
            assignedGuide: slot.assignedGuideId ? {
              firstName: slot.assignedGuideId.firstName,
              lastName: slot.assignedGuideId.lastName,
              email: slot.assignedGuideId.email
            } : null,
            bookings: bookings.map(b => ({
              bookingId: b._id,
              passengers: b.passengers || [],
              totalPassengers: b.totalPassengers || 0
            }))
          });
        } catch (bookingError) {
          console.error(`Error fetching bookings for slot ${slot._id}:`, bookingError);
        }

        // Add all sub-slots if they exist
        if (slot.requiresSubSlots && slot.subSlots && slot.subSlots.length > 0) {
          for (const subSlot of slot.subSlots) {
            try {
              const bookings = await ActivityBooking.find({ 
                slotId: slot._id,
                subSlotId: subSlot.subSlotId,
                status: { $ne: 'CANCELLED' }
              })
                .select('passengers totalPassengers totalAdults totalYouth totalChildren')
                .lean();

              assignedTours.push({
                slotId: slot._id,
                subSlotId: subSlot.subSlotId,
                productId: slot.productId,
                productTitle: slot.productTitle,
                productNickname: productNicknameMap[String(slot.productId)] || null,
                startDateTime: slot.startDateTime,
                endDateTime: slot.endDateTime,
                passengerCount: subSlot.currentPassengerCount || 0,
                passengerBreakdown: {
                  adults: subSlot.ticketCostCalculation?.adults?.count || 0,
                  youth: subSlot.ticketCostCalculation?.youth?.count || 0,
                  children: subSlot.ticketCostCalculation?.children?.count || 0
                },
                ticketCost: subSlot.ticketCostCalculation,
                status: subSlot.status || 'ASSIGNED',
                assignedGuide: subSlot.assignedGuideId ? {
                  firstName: subSlot.assignedGuideId.firstName,
                  lastName: subSlot.assignedGuideId.lastName,
                  email: subSlot.assignedGuideId.email
                } : null,
                bookings: bookings.map(b => ({
                  bookingId: b._id,
                  passengers: b.passengers || [],
                  totalPassengers: b.totalPassengers || 0
                }))
              });
            } catch (bookingError) {
              console.error(`Error fetching bookings for sub-slot ${subSlot.subSlotId}:`, bookingError);
            }
          }
        }
      } 
      // For GUIDES: Only show slots/sub-slots assigned to them
      else {
        const Guide = mongoose.model('Guide');
        const guide = await Guide.findOne({ userId });
        const guideId = guide._id;

        // Check if guide is assigned at root level
        if (slot.assignedGuideId?.toString() === guideId.toString()) {
          try {
            const bookings = await ActivityBooking.find({ 
              slotId: slot._id,
              status: { $ne: 'CANCELLED' }
            })
              .select('passengers totalPassengers totalAdults totalYouth totalChildren')
              .lean();

            assignedTours.push({
              slotId: slot._id,
              subSlotId: null,
              productId: slot.productId,
              productTitle: slot.productTitle,
              productNickname: productNicknameMap[String(slot.productId)] || null,
              startDateTime: slot.startDateTime,
              endDateTime: slot.endDateTime,
              passengerCount: slot.currentPassengerCount,
              passengerBreakdown: {
                adults: slot.ticketCostCalculation?.adults?.count || 0,
                youth: slot.ticketCostCalculation?.youth?.count || 0,
                children: slot.ticketCostCalculation?.children?.count || 0
              },
              ticketCost: slot.ticketCostCalculation,
              status: slot.status,
              bookings: bookings.map(b => ({
                bookingId: b._id,
                passengers: b.passengers || [],
                totalPassengers: b.totalPassengers || 0
              }))
            });
          } catch (bookingError) {
            console.error(`Error fetching bookings for slot ${slot._id}:`, bookingError);
          }
        }

        // Check sub-slots
        if (slot.requiresSubSlots && slot.subSlots && slot.subSlots.length > 0) {
          for (const subSlot of slot.subSlots) {
            if (subSlot.assignedGuideId?.toString() === guideId.toString()) {
              try {
                const bookings = await ActivityBooking.find({ 
                  slotId: slot._id,
                  subSlotId: subSlot.subSlotId,
                  status: { $ne: 'CANCELLED' }
                })
                  .select('passengers totalPassengers totalAdults totalYouth totalChildren')
                  .lean();

                assignedTours.push({
                  slotId: slot._id,
                  subSlotId: subSlot.subSlotId,
                  productId: slot.productId,
                  productTitle: slot.productTitle,
                  productNickname: productNicknameMap[String(slot.productId)] || null,
                  startDateTime: slot.startDateTime,
                  endDateTime: slot.endDateTime,
                  passengerCount: subSlot.currentPassengerCount || 0,
                  passengerBreakdown: {
                    adults: subSlot.ticketCostCalculation?.adults?.count || 0,
                    youth: subSlot.ticketCostCalculation?.youth?.count || 0,
                    children: subSlot.ticketCostCalculation?.children?.count || 0
                  },
                  ticketCost: subSlot.ticketCostCalculation,
                  status: subSlot.status || 'ASSIGNED',
                  bookings: bookings.map(b => ({
                    bookingId: b._id,
                    passengers: b.passengers || [],
                    totalPassengers: b.totalPassengers || 0
                  }))
                });
              } catch (bookingError) {
                console.error(`Error fetching bookings for sub-slot ${subSlot.subSlotId}:`, bookingError);
              }
            }
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        assignedTours,
        totalAssignments: assignedTours.length
      }
    });
  } catch (error) {
    console.error('Error fetching guide assigned tours:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch assigned tours' 
    });
  }
};
