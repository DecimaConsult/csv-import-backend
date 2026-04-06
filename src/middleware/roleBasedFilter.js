/**
 * Role-Based Data Filtering Middleware
 * Filters API response data based on user role (ADMIN vs GUIDE)
 * 
 * Requirements:
 * - Hide product pricing from guide responses
 * - Hide booking source from guide responses
 * - Hide booking metadata from guide responses
 * - Ensure guides only see assigned sub-slots
 * - Ensure admins see all data
 */

/**
 * Filter product data based on user role
 * Admins see all data, guides see limited data without pricing
 * 
 * @param {Object} product - Product document
 * @param {String} userRole - User role (ADMIN or GUIDE)
 * @returns {Object} Filtered product data
 */
export const filterProductData = (product, userRole) => {
  // ADMIN sees everything
  if (userRole === 'ADMIN') {
    return product;
  }
  
  // Convert Mongoose document to plain object if needed
  const productObj = product.toObject ? product.toObject() : product;
  
  // Remove pricing for COORDINATOR and GUIDE
  const { ticketPricing, ...filteredProduct } = productObj;
  return filteredProduct;
};

/**
 * Filter booking data based on user role
 * Admins see all data, guides see limited data without source and metadata
 * 
 * @param {Object} booking - Booking document
 * @param {String} userRole - User role (ADMIN or GUIDE)
 * @returns {Object} Filtered booking data
 */
export const filterBookingData = (booking, userRole) => {
  // ADMIN sees everything
  if (userRole === 'ADMIN') {
    return booking;
  }
  
  // COORDINATOR sees booking source but not selected options
  if (userRole === 'COORDINATOR') {
    const { selectedOptions, ...filteredBooking } = booking;
    return filteredBooking;
  }
  
  // GUIDE sees minimal data
  const { 
    bookingSource, 
    selectedOptions,
    ...filteredBooking 
  } = booking;
  
  return filteredBooking;
};

/**
 * Filter sub-slot data based on user role
 * Admins see all data including pricing breakdown
 * Guides see only total cost without pricing breakdown
 * 
 * @param {Object} subSlot - Sub-slot document
 * @param {String} userRole - User role (ADMIN or GUIDE)
 * @param {Object} product - Product document (optional, for pricing info)
 * @returns {Object} Filtered sub-slot data
 */
export const filterSubSlotData = (subSlot, userRole, product = null) => {
  if (userRole === 'ADMIN') {
    return subSlot;
  }
  
  // For guides, filter ticket cost calculation to hide pricing details
  const filtered = { ...subSlot };
  
  if (filtered.ticketCostCalculation) {
    // Keep only the total, remove individual pricing breakdown
    filtered.ticketCostCalculation = {
      total: filtered.ticketCostCalculation.total,
      // Keep counts but remove prices
      adults: filtered.ticketCostCalculation.adults ? {
        count: filtered.ticketCostCalculation.adults.count
      } : undefined,
      youth: filtered.ticketCostCalculation.youth ? {
        count: filtered.ticketCostCalculation.youth.count
      } : undefined,
      children: filtered.ticketCostCalculation.children ? {
        count: filtered.ticketCostCalculation.children.count
      } : undefined
    };
  }
  
  return filtered;
};

/**
 * Filter time slot data based on user role
 * Admins see all data
 * Guides see only their assigned slots with filtered data
 * 
 * @param {Object} slot - Time slot document
 * @param {String} userRole - User role (ADMIN or GUIDE)
 * @param {String} guideId - Guide's MongoDB ObjectId (for filtering)
 * @param {Object} product - Product document (optional, for pricing info)
 * @returns {Object|null} Filtered slot data or null if guide not assigned
 */
export const filterTimeSlotData = (slot, userRole, guideId = null, product = null) => {
  // ADMIN and COORDINATOR see all slots
  if (userRole === 'ADMIN' || userRole === 'COORDINATOR') {
    return slot;
  }
  
  // For guides, check if they are assigned to this slot
  let isAssigned = false;
  
  // Check root-level assignment (non-sub-slot products)
  if (slot.assignedGuideId && guideId && 
      slot.assignedGuideId.toString() === guideId.toString()) {
    isAssigned = true;
  }
  
  // Check sub-slot assignments
  if (slot.subSlots && slot.subSlots.length > 0 && guideId) {
    const hasAssignedSubSlot = slot.subSlots.some(
      ss => ss.assignedGuideId && ss.assignedGuideId.toString() === guideId.toString()
    );
    if (hasAssignedSubSlot) {
      isAssigned = true;
    }
  }
  
  // If guide is not assigned, return null (hide this slot)
  if (!isAssigned) {
    return null;
  }
  
  // Filter the slot data
  const filtered = { ...slot };
  
  // Filter root-level ticket cost calculation
  if (filtered.ticketCostCalculation) {
    filtered.ticketCostCalculation = {
      total: filtered.ticketCostCalculation.total,
      adults: filtered.ticketCostCalculation.adults ? {
        count: filtered.ticketCostCalculation.adults.count
      } : undefined,
      youth: filtered.ticketCostCalculation.youth ? {
        count: filtered.ticketCostCalculation.youth.count
      } : undefined,
      children: filtered.ticketCostCalculation.children ? {
        count: filtered.ticketCostCalculation.children.count
      } : undefined
    };
  }
  
  // Filter sub-slots - only show assigned sub-slots to guides
  if (filtered.subSlots && filtered.subSlots.length > 0) {
    filtered.subSlots = filtered.subSlots
      .filter(ss => ss.assignedGuideId && guideId && 
                    ss.assignedGuideId.toString() === guideId.toString())
      .map(ss => filterSubSlotData(ss, userRole, product));
  }
  
  return filtered;
};

/**
 * Middleware to filter response data based on user role
 * Intercepts res.json() to apply role-based filtering
 * 
 * Usage: Add this middleware to routes that need role-based filtering
 * Example: router.get('/api/products', authenticate, filterResponse, getProducts);
 */
export const filterResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    const userRole = req.user?.role;
    
    if (!userRole || userRole === 'ADMIN') {
      // No filtering for admins or unauthenticated requests
      return originalJson(data);
    }
    
    // Apply filtering for guides
    const filteredData = applyRoleBasedFiltering(data, userRole, req.user?.id);
    return originalJson(filteredData);
  };
  
  next();
};

/**
 * Apply role-based filtering to response data
 * Recursively filters nested objects and arrays
 * 
 * @param {*} data - Response data to filter
 * @param {String} userRole - User role (ADMIN or GUIDE)
 * @param {String} userId - User ID for guide filtering
 * @returns {*} Filtered data
 */
function applyRoleBasedFiltering(data, userRole, userId) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data
      .map(item => applyRoleBasedFiltering(item, userRole, userId))
      .filter(item => item !== null);
  }
  
  // Handle objects
  const filtered = { ...data };
  
  // Filter based on data type indicators
  if (filtered.ticketPricing) {
    // This is product data
    return filterProductData(filtered, userRole);
  }
  
  if (filtered.bookingSource !== undefined || filtered.selectedOptions !== undefined) {
    // This is booking data
    return filterBookingData(filtered, userRole);
  }
  
  if (filtered.subSlotId !== undefined && filtered.maxCapacity !== undefined) {
    // This is sub-slot data
    return filterSubSlotData(filtered, userRole);
  }
  
  if (filtered.startDateTime !== undefined && filtered.productId !== undefined) {
    // This is time slot data
    return filterTimeSlotData(filtered, userRole, userId);
  }
  
  // Recursively filter nested objects
  for (const key in filtered) {
    if (filtered[key] && typeof filtered[key] === 'object') {
      filtered[key] = applyRoleBasedFiltering(filtered[key], userRole, userId);
    }
  }
  
  return filtered;
}

/**
 * Middleware specifically for product endpoints
 * Filters product pricing for guides
 */
export const filterProductResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    const userRole = req.user?.role;
    
    if (!userRole || userRole === 'ADMIN') {
      return originalJson(data);
    }
    
    // Filter product data for guides
    if (data.data) {
      if (Array.isArray(data.data)) {
        data.data = data.data.map(product => filterProductData(product, userRole));
      } else {
        data.data = filterProductData(data.data, userRole);
      }
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware specifically for booking endpoints
 * Filters booking source and metadata for guides
 */
export const filterBookingResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    const userRole = req.user?.role;
    
    if (!userRole || userRole === 'ADMIN') {
      return originalJson(data);
    }
    
    // Filter booking data for guides
    if (data.bookings) {
      data.bookings = data.bookings.map(booking => filterBookingData(booking, userRole));
    }
    
    if (data.booking) {
      data.booking = filterBookingData(data.booking, userRole);
      
      // Also filter activity bookings if present
      if (data.booking.activityBookings) {
        data.booking.activityBookings = data.booking.activityBookings.map(
          ab => filterBookingData(ab, userRole)
        );
      }
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Middleware specifically for sub-slot endpoints
 * Filters sub-slot data and ensures guides only see assigned sub-slots
 */
export const filterSubSlotResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    const userRole = req.user?.role;
    
    if (!userRole || userRole === 'ADMIN') {
      return originalJson(data);
    }
    
    // Filter sub-slot data for guides
    if (data.data && data.data.subSlots) {
      data.data.subSlots = data.data.subSlots.map(
        subSlot => filterSubSlotData(subSlot, userRole)
      );
    }
    
    if (data.data && data.data.subSlot) {
      data.data.subSlot = filterSubSlotData(data.data.subSlot, userRole);
      
      // Filter bookings within sub-slot
      if (data.data.subSlot.bookings) {
        data.data.subSlot.bookings = data.data.subSlot.bookings.map(
          booking => filterBookingData(booking, userRole)
        );
      }
    }
    
    return originalJson(data);
  };
  
  next();
};

export default {
  filterProductData,
  filterBookingData,
  filterSubSlotData,
  filterTimeSlotData,
  filterResponse,
  filterProductResponse,
  filterBookingResponse,
  filterSubSlotResponse
};
