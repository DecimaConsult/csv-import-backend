import Product from '../models/Product.js';

export const getProducts = async (req, res) => {
  try {
    const { active } = req.query;
    let query = {};
    
    if (active !== undefined) {
      query.active = active === 'true';
    }

    const products = await Product.find(query).select('-__v').sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    // Convert to string since Product.productId is String but may receive Number
    const productIdStr = String(productId);
    const product = await Product.findOne({ productId: productIdStr }).select('-__v').lean();

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { productId, name, description, requiresSubSlots, subSlotCapacity, ticketPricing, availableOptions, active } = req.body;

    if (!productId || !name) {
      return res.status(400).json({ success: false, error: 'Missing required fields: productId, name' });
    }

    if (!ticketPricing || typeof ticketPricing.adult !== 'number' || typeof ticketPricing.youth !== 'number' || typeof ticketPricing.child !== 'number') {
      return res.status(400).json({ success: false, error: 'Invalid ticket pricing. Must include adult, youth, and child prices as numbers' });
    }

    const existingProduct = await Product.findOne({ productId });
    if (existingProduct) {
      return res.status(409).json({ success: false, error: 'Product with this productId already exists' });
    }

    const product = new Product({
      productId,
      name,
      description: description || '',
      requiresSubSlots: requiresSubSlots !== undefined ? requiresSubSlots : false,
      subSlotCapacity: subSlotCapacity || 25,
      ticketPricing,
      availableOptions: availableOptions || [],
      active: active !== undefined ? active : true
    });

    await product.save();
    res.status(201).json({ success: true, message: 'Product created successfully', data: product });
  } catch (error) {
    console.error('Error creating product:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Product with this productId already exists' });
    }
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updates = req.body;

    if (updates.productId && updates.productId !== productId) {
      return res.status(400).json({ success: false, error: 'Cannot change productId' });
    }

    // Validate durationMinutes if provided
    if (updates.durationMinutes !== undefined) {
      if (typeof updates.durationMinutes !== 'number' || updates.durationMinutes < 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Duration must be a non-negative number' 
        });
      }
    }

    const product = await Product.findOneAndUpdate(
      { productId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.status(200).json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
};

export const updateProductPricing = async (req, res) => {
  try {
    const { productId } = req.params;
    const { adult, youth, child } = req.body;

    if (adult === undefined && youth === undefined && child === undefined) {
      return res.status(400).json({ success: false, error: 'At least one pricing field (adult, youth, child) must be provided' });
    }

    const pricingUpdates = {};
    if (adult !== undefined) {
      if (typeof adult !== 'number' || adult < 0) {
        return res.status(400).json({ success: false, error: 'Adult price must be a non-negative number' });
      }
      pricingUpdates['ticketPricing.adult'] = adult;
    }
    if (youth !== undefined) {
      if (typeof youth !== 'number' || youth < 0) {
        return res.status(400).json({ success: false, error: 'Youth price must be a non-negative number' });
      }
      pricingUpdates['ticketPricing.youth'] = youth;
    }
    if (child !== undefined) {
      if (typeof child !== 'number' || child < 0) {
        return res.status(400).json({ success: false, error: 'Child price must be a non-negative number' });
      }
      pricingUpdates['ticketPricing.child'] = child;
    }

    const product = await Product.findOneAndUpdate(
      { productId },
      { $set: pricingUpdates },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Product pricing updated successfully',
      data: { productId: product.productId, name: product.name, ticketPricing: product.ticketPricing }
    });
  } catch (error) {
    console.error('Error updating product pricing:', error);
    res.status(500).json({ success: false, error: 'Failed to update product pricing' });
  }
};

export const checkProductRequiresTickets = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Convert to string since Product.productId is String but TimeSlot.productId is Number
    const productIdStr = String(productId);
    
    const product = await Product.findOne({ productId: productIdStr }).select('productId requiresTickets').lean();

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.status(200).json({ 
      success: true, 
      data: { 
        productId: product.productId,
        requiresTickets: product.requiresTickets || false 
      } 
    });
  } catch (error) {
    console.error('Error checking product tickets requirement:', error);
    res.status(500).json({ success: false, error: 'Failed to check product' });
  }
};

export const syncProductsFromBokun = async (req, res) => {
  try {
    const axios = (await import('axios')).default;
    const crypto = (await import('crypto')).default;
    
    const accessKey = process.env.BOKUN_ACCESS_KEY;
    const secretKey = process.env.BOKUN_SECRET_KEY;
    const BOKUN_API_BASE = 'https://api.bokun.io';
    
    if (!accessKey || !secretKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'Bokun API credentials not configured' 
      });
    }

    const generateSignature = (method, path, date) => {
      const signatureBase = date + accessKey + method + path;
      const hmac = crypto.createHmac('sha1', secretKey);
      hmac.update(signatureBase);
      return hmac.digest('base64');
    };

    const getBokunDate = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    // Fetch product lists
    let path = '/product-list.json/list';
    let date = getBokunDate();
    let signature = generateSignature('GET', path, date);

    const listsResponse = await axios.get(`${BOKUN_API_BASE}${path}`, {
      headers: {
        'X-Bokun-Date': date,
        'X-Bokun-AccessKey': accessKey,
        'X-Bokun-Signature': signature,
        'Content-Type': 'application/json'
      }
    });

    const productLists = listsResponse.data;
    const allProducts = [];

    // Fetch products from each list
    for (const list of productLists) {
      path = `/product-list.json/${list.id}`;
      date = getBokunDate();
      signature = generateSignature('GET', path, date);

      const listDetailResponse = await axios.get(`${BOKUN_API_BASE}${path}`, {
        headers: {
          'X-Bokun-Date': date,
          'X-Bokun-AccessKey': accessKey,
          'X-Bokun-Signature': signature,
          'Content-Type': 'application/json'
        }
      });

      if (listDetailResponse.data.items) {
        for (const item of listDetailResponse.data.items) {
          if (item.activity) {
            allProducts.push(item.activity);
          }
        }
      }
    }

    // Sync products to database
    const results = { created: 0, updated: 0, unchanged: 0 };

    for (const bokunProduct of allProducts) {
      const productId = String(bokunProduct.id);
      
      const existingProduct = await Product.findOne({ productId });

      if (existingProduct) {
        // ONLY update name and description from Bokun
        // PRESERVE all custom settings (pricing, sub-slots, tickets, nickname)
        const updateData = {
          name: bokunProduct.title,
          'bokunData.vendorId': bokunProduct.vendor?.id,
          'bokunData.productCategory': bokunProduct.productCategory,
          'bokunData.excerpt': bokunProduct.excerpt,
          'bokunData.description': bokunProduct.description
        };
        
        await Product.updateOne({ productId }, { $set: updateData });
        results.updated++;
      } else {
        // Create new product with defaults
        const productData = {
          productId,
          name: bokunProduct.title,
          nickname: bokunProduct.title,
          externalId: bokunProduct.externalId || null,
          requiresSubSlots: false,
          subSlotCapacity: 25,
          requiresTickets: false,
          ticketPricing: { adult: 0, youth: 0, child: 0 },
          active: true,
          bokunData: {
            vendorId: bokunProduct.vendor?.id,
            productCategory: bokunProduct.productCategory,
            excerpt: bokunProduct.excerpt,
            description: bokunProduct.description
          }
        };
        
        await Product.create(productData);
        results.created++;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Products synced successfully',
      data: {
        total: allProducts.length,
        created: results.created,
        updated: results.updated
      }
    });

  } catch (error) {
    console.error('Error syncing products from Bokun:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to sync products from Bokun',
      details: error.message 
    });
  }
};
