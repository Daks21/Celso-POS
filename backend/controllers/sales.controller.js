const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

const getSales = (req, res) => {
  const { from, to } = req.query;
  const sales = saleModel.getAll({ from, to });
  res.status(200).json({ success: true, data: sales });
};

const getOne = (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid sale ID' });
  }

  const sale = saleModel.getById(id);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  res.status(200).json({ success: true, data: sale });
};

const createSale = (req, res) => {
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

  // Phase 1 — validate every item before touching any record
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity  = Number(item.quantity);
    const lineTotal = Number(item.lineTotal);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Item quantity must be a positive whole number' });
    }

    const product = productModel.getById(productId);
    if (!product) {
      return res.status(400).json({ success: false, message: `Product ID ${item.productId} not found` });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
    }

    const expectedLineTotal = product.price * quantity;
    if (Math.abs(expectedLineTotal - lineTotal) > 0.01) {
      return res.status(400).json({ success: false, message: `Price mismatch for ${product.name}` });
    }
  }

  // Verify client-sent subtotal matches server-computed sum of line totals
  const serverSubtotal = items.reduce((sum, item) => {
    const product = productModel.getById(Number(item.productId));
    return sum + product.price * Number(item.quantity);
  }, 0);

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
      const product = productModel.getById(Number(item.productId));
      return {
        productId: Number(item.productId),
        name:      product.name,
        price:     product.price,
        quantity:  Number(item.quantity),
        lineTotal: product.price * Number(item.quantity)
      };
    }),
    subtotal,
    tax,
    taxRate:    tax > 0 ? (taxRate || 0) : 0,
    cartTaxOn:  Boolean(cartTaxOn),
    total,
    payment,
    change:     payment - total,
    timestamp:  new Date().toISOString(),
    cashier:    req.user.fullName
  };

  // Phase 3 — persist sale, then deduct stock
  const sale = saleModel.create(saleRecord);

  for (const item of items) {
    const product = productModel.getById(Number(item.productId));
    productModel.update(product.id, { stock: product.stock - Number(item.quantity) });
  }

  res.status(201).json({ success: true, data: sale });
};

// GET /api/sales/summary — today's revenue and transaction count
const getSummary = (req, res) => {
  const summary = saleModel.getTodaySummary();
  res.status(200).json({ success: true, data: summary });
};

module.exports = { getSales, getOne, createSale, getSummary };
