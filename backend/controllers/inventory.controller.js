const Product = require('../models/product.model');

const VALID_TYPES    = ['restock', 'adjustment', 'damage', 'return'];
const REMOVING_TYPES = ['damage', 'adjustment'];

const getAll = async (req, res, next) => {
  try {
    const levels = await Product.getStockLevels();
    res.json({ success: true, data: levels });
  } catch (err) {
    next(err);
  }
};

const getLowStock = async (req, res, next) => {
  try {
    const threshold = parseInt(req.query.threshold, 10) || 50;
    if (threshold <= 0) {
      return res.status(400).json({ success: false, message: 'threshold must be a positive number' });
    }
    const items = await Product.getLowStock(threshold);
    res.json({ success: true, threshold, count: items.length, data: items });
  } catch (err) {
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const parsed    = parseInt(req.query.threshold, 10);
    const threshold = (!isNaN(parsed) && parsed > 0) ? parsed : 50;
    const counts    = await Product.getInventoryCounts(threshold);
    res.json({ success: true, data: counts });
  } catch (err) {
    next(err);
  }
};

const adjust = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const { quantity, type, notes } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${VALID_TYPES.join(', ')}`
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'quantity must be a positive integer'
      });
    }

    const product = await Product.getById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const delta   = REMOVING_TYPES.includes(type) ? -quantity : quantity;
    const updated = await Product.adjustStock(productId, delta, type, notes || null, req.user.id);

    res.json({
      success: true,
      data: {
        product: { id: updated.id, name: updated.name, stock: updated.stock, unit: updated.unit },
        adjustment: {
          type,
          quantity,
          notes:      notes || null,
          adjustedBy: req.user.fullName || req.user.email,
          timestamp:  new Date().toISOString(),
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getLowStock, getSummary, adjust };
