import express from 'express';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  updateProductPricing,
  checkProductRequiresTickets,
  syncProductsFromBokun
} from '../controllers/productController.js';
import { requireRole, authenticate } from '../middleware/auth.js';
import { filterProductResponse } from '../middleware/roleBasedFilter.js';

const router = express.Router();

/**
 * GET /api/products
 * Get all products with optional active status filtering
 * Query params:
 *   - active: boolean (filter by active status)
 * Returns: Array of product objects
 * Auth: Authenticated users (both ADMIN and GUIDE)
 * Data Filtering:
 *   - Admins see all data including ticket pricing
 *   - Guides see product info without pricing details
 */
router.get('/', authenticate, filterProductResponse, getProducts);

/**
 * POST /api/products/sync-from-bokun
 * Sync products from Bokun API
 * Fetches all products from Bokun and updates local database
 * Returns: Sync results (created, updated counts)
 * Auth: ADMIN only
 */
router.post('/sync-from-bokun', requireRole(['ADMIN']), syncProductsFromBokun);

/**
 * GET /api/products/:productId/requires-tickets
 * Check if product requires tickets (lightweight endpoint for guides)
 * Params:
 *   - productId: Product identifier
 * Returns: { productId, requiresTickets }
 * Auth: Authenticated users (both ADMIN and GUIDE)
 */
router.get('/:productId/requires-tickets', authenticate, checkProductRequiresTickets);

/**
 * GET /api/products/:productId
 * Get single product by productId
 * Params:
 *   - productId: Product identifier (e.g., "eiffel-tower")
 * Returns: Product object
 * Auth: Authenticated users (both ADMIN and GUIDE)
 * Data Filtering:
 *   - Admins see all data including ticket pricing
 *   - Guides see product info without pricing details
 */
router.get('/:productId', authenticate, filterProductResponse, getProductById);

/**
 * POST /api/products
 * Create new product
 * Body:
 *   - productId: string (required, unique)
 *   - name: string (required)
 *   - description: string (optional)
 *   - requiresSubSlots: boolean (optional, default: false)
 *   - subSlotCapacity: number (optional, default: 25)
 *   - ticketPricing: object (required)
 *     - adult: number (required)
 *     - youth: number (required)
 *     - child: number (required)
 *   - availableOptions: array (optional)
 *   - active: boolean (optional, default: true)
 * Returns: Created product object
 * Auth: ADMIN only
 */
router.post('/', requireRole(['ADMIN', 'STAFF']), createProduct);

/**
 * PUT /api/products/:productId
 * Update product details
 * Params:
 *   - productId: Product identifier
 * Body: Any product fields to update
 * Returns: Updated product object
 * Auth: ADMIN only
 */
router.put('/:productId', requireRole(['ADMIN', 'STAFF']), updateProduct);

/**
 * PUT /api/products/:productId/pricing
 * Update product ticket pricing
 * Params:
 *   - productId: Product identifier
 * Body:
 *   - adult: number (optional)
 *   - youth: number (optional)
 *   - child: number (optional)
 * Returns: Updated product with pricing
 * Auth: ADMIN only
 */
router.put('/:productId/pricing', requireRole(['ADMIN', 'STAFF']), updateProductPricing);

export default router;
