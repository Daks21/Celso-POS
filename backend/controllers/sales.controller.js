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

    // Build the server-authoritative line items (price from the DB, never the
    // client) and derive the header from THEM, so the stored subtotal always
    // equals the exact sum of the persisted line totals.
    const serverItems = items.map(item => {
      const product  = productCache[Number(item.productId)];
      const quantity = Number(item.quantity);
      return {
        productId: Number(item.productId),
        name:      product.name,
        price:     product.price,
        quantity,
        lineTotal: parseFloat((product.price * quantity).toFixed(2)),
      };
    });

    const serverSubtotal = parseFloat(
      serverItems.reduce((sum, it) => sum + it.lineTotal, 0).toFixed(2)
    );
    if (Math.abs(serverSubtotal - subtotal) > 0.01) {
      return res.status(400).json({ success: false, message: 'Subtotal does not match item totals' });
    }

    // Tax applies only when the client sent a positive tax; the rate was range-
    // checked above. Recompute the amount from the server subtotal rather than
    // trusting the client figure.
    const serverTax = tax > 0 ? parseFloat((serverSubtotal * parsedTaxRate).toFixed(2)) : 0;
    if (tax > 0 && Math.abs(serverTax - tax) > 0.02) {
      return res.status(400).json({ success: false, message: 'Tax amount does not match the supplied tax rate' });
    }
    if (Math.abs((subtotal + tax) - total) > 0.01) {
      return res.status(400).json({ success: false, message: 'Total does not match subtotal + tax' });
    }

    const serverTotal = parseFloat((serverSubtotal + serverTax).toFixed(2));
    if (payment < serverTotal) {
      return res.status(400).json({ success: false, message: 'Payment is less than the total' });
    }

    // Phase 2 — record built entirely from server-recomputed values. The client
    // numbers above were only the verification gate; what we persist is ours, so
    // the header, the receipt line items, and Finance "Money In" agree to the centavo.
    const saleRecord = {
      items:     serverItems,
      subtotal:  serverSubtotal,
      tax:       serverTax,
      taxRate:   serverTax > 0 ? parsedTaxRate : 0,
      cartTaxOn: Boolean(cartTaxOn),
      total:     serverTotal,
      payment,
      change:    parseFloat((payment - serverTotal).toFixed(2)),
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
