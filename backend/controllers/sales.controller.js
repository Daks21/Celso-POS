const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

const getSales = async (req, res, next) => {
  try {
    const { from, to, limit } = req.query;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const sales = await saleModel.getAll(
      req.user.storeId,
      { from, to, limit: parsedLimit && parsedLimit > 0 ? parsedLimit : undefined },
      req.store.timezone
    );
    res.status(200).json({ success: true, data: sales });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid sale ID' });
    }
    const sale = await saleModel.getById(req.user.storeId, id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    res.status(200).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
};

const createSale = async (req, res, next) => {
  try {
    const { items, payment, tax, taxRate, subtotal, total, cartTaxOn } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    if (typeof payment !== 'number' || isNaN(payment)) {
      return res.status(400).json({ success: false, message: 'Payment must be a number' });
    }
    if (typeof subtotal !== 'number' || typeof tax !== 'number' || typeof total !== 'number') {
      return res.status(400).json({ success: false, message: 'subtotal, tax, and total must be numbers' });
    }
    if (tax < 0) {
      return res.status(400).json({ success: false, message: 'Tax cannot be negative' });
    }
    const parsedTaxRate = Number(taxRate);
    if (isNaN(parsedTaxRate) || parsedTaxRate < 0 || parsedTaxRate > 1) {
      return res.status(400).json({ success: false, message: 'taxRate must be a decimal between 0 and 1' });
    }

    // Phase 1 — validate every item, cache DB lookups to avoid duplicate queries
    const productCache = {};
    for (const item of items) {
      const productId = Number(item.productId);
      const quantity  = Number(item.quantity);
      const lineTotal = Number(item.lineTotal);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, message: 'Item quantity must be a positive whole number' });
      }
      if (!productCache[productId]) {
        productCache[productId] = await productModel.getById(req.user.storeId, productId);
      }
      const product = productCache[productId];
      if (!product) {
        return res.status(400).json({ success: false, message: `Product ID ${productId} not found` });
      }
      if (product.stock < quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }
      const expectedLineTotal = product.price * quantity;
      if (Math.abs(expectedLineTotal - lineTotal) > 0.01) {
        return res.status(400).json({ success: false, message: `Price mismatch for ${product.name}` });
      }
    }

    // Server-side subtotal verification
    let serverSubtotal = 0;
    for (const item of items) {
      const product = productCache[Number(item.productId)];
      serverSubtotal += product.price * Number(item.quantity);
    }
    if (Math.abs(serverSubtotal - subtotal) > 0.01) {
      return res.status(400).json({ success: false, message: 'Subtotal does not match item totals' });
    }
    if (tax > 0) {
      const expectedTax = parseFloat((serverSubtotal * parsedTaxRate).toFixed(2));
      if (Math.abs(expectedTax - tax) > 0.02) {
        return res.status(400).json({ success: false, message: 'Tax amount does not match the supplied tax rate' });
      }
    }
    if (Math.abs((subtotal + tax) - total) > 0.01) {
      return res.status(400).json({ success: false, message: 'Total does not match subtotal + tax' });
    }
    if (payment < total) {
      return res.status(400).json({ success: false, message: 'Payment is less than the total' });
    }

    // Phase 2 — build record with server-authoritative prices
    const saleRecord = {
      items: items.map(item => {
        const product = productCache[Number(item.productId)];
        return {
          productId: Number(item.productId),
          name:      product.name,
          price:     product.price,
          quantity:  Number(item.quantity),
          lineTotal: product.price * Number(item.quantity),
        };
      }),
      subtotal,
      tax,
      taxRate:   tax > 0 ? (taxRate || 0) : 0,
      cartTaxOn: Boolean(cartTaxOn),
      total,
      payment,
      change:    payment - total,
    };

    // Phase 3 — atomic transaction handles sale + stock + audit log
    const sale = await saleModel.create(req.user.storeId, saleRecord, req.user.id, req.store.timezone);
    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
};

const updateSale = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid sale ID' });
    }

    const { items, payment, cartTaxOn } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items must be an array' });
    }
    if (typeof payment !== 'number' || isNaN(payment)) {
      return res.status(400).json({ success: false, message: 'Payment must be a number' });
    }

    const sale = await saleModel.update(req.user.storeId, id, { items, payment, cartTaxOn }, req.user.id);
    res.status(200).json({ success: true, data: sale });
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const summary = await saleModel.getTodaySummary(req.user.storeId, req.store.timezone);
    res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSales, getOne, createSale, updateSale, getSummary };
