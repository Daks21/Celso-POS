const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

const getSales = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const sales = await saleModel.getAll({ from, to });
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
    const sale = await saleModel.getById(id);
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
        productCache[productId] = await productModel.getById(productId);
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
    const sale = await saleModel.create(saleRecord, req.user.id);
    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const summary = await saleModel.getTodaySummary();
    res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSales, getOne, createSale, getSummary };
