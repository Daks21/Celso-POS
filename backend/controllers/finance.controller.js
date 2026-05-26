const Cashflow  = require('../models/cashflow.model');
const saleModel = require('../models/sale.model');

const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// Manila local date in YYYY-MM-DD. Avoids server-TZ drift on Profit defaults.
const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });

// Same-length window ending the day before `from`. Used for prior-period delta.
function priorWindow(from, to) {
  const fromDate = new Date(from + 'T12:00:00Z');
  const toDate   = new Date(to   + 'T12:00:00Z');
  const days     = Math.round((toDate - fromDate) / 86400000) + 1;
  const prevTo   = new Date(fromDate);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to:   prevTo.toISOString().slice(0, 10),
  };
}

function validateCategory(type, category) {
  const allowed = Cashflow.CATEGORY_BY_TYPE[type];
  // null means free-form — any non-empty string is valid
  if (allowed === null) return null;
  if (category && !allowed.includes(category))
    return `category for '${type}' must be one of: ${allowed.join(', ')}`;
  return null;
}

const getAll = async (req, res, next) => {
  try {
    const { type, category, from, to } = req.query;
    const filters = {};
    if (type && Cashflow.VALID_TYPES.includes(type)) filters.type = type;
    if (category) filters.category = category;
    if (from)     filters.from     = from;
    if (to)       filters.to       = to;
    const data = await Cashflow.getAll(filters);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const filters = {};
    if (from) filters.from = from;
    if (to)   filters.to   = to;
    const data = await Cashflow.getSummary(filters);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { type, category, amount, description, occurred_at } = req.body;

    if (!type || !Cashflow.VALID_TYPES.includes(type))
      return res.status(400).json({ success: false, message: `type must be one of: ${Cashflow.VALID_TYPES.join(', ')}` });

    if (type === 'sales_revenue')
      return res.status(400).json({ success: false, message: 'sales_revenue entries are created automatically by the POS' });

    if (!amount || typeof amount !== 'number' || amount <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    if (!occurred_at || !DATE_RE.test(occurred_at))
      return res.status(400).json({ success: false, message: 'occurred_at must be a valid date in YYYY-MM-DD format' });

    const catError = validateCategory(type, category);
    if (catError) return res.status(400).json({ success: false, message: catError });

    const entry = await Cashflow.create({
      type,
      category:    category    || null,
      amount,
      description: description || null,
      occurred_at,
      source:      'manual',
      recorded_by: req.user.id,
    });

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const existing = await Cashflow.getById(id);
    if (!existing)                    return res.status(404).json({ success: false, message: 'Entry not found' });
    if (existing.source !== 'manual') return res.status(400).json({ success: false, message: 'Auto-created entries cannot be edited' });

    const { type, category, amount, description, occurred_at } = req.body;

    if (!type || !Cashflow.VALID_TYPES.includes(type))
      return res.status(400).json({ success: false, message: `type must be one of: ${Cashflow.VALID_TYPES.join(', ')}` });

    if (!amount || typeof amount !== 'number' || amount <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    if (!occurred_at || !DATE_RE.test(occurred_at))
      return res.status(400).json({ success: false, message: 'occurred_at must be a valid date in YYYY-MM-DD format' });

    const catError = validateCategory(type, category);
    if (catError) return res.status(400).json({ success: false, message: catError });

    const entry = await Cashflow.update(id, {
      type,
      category:    category    || null,
      amount,
      description: description || null,
      occurred_at,
    });
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found or cannot be edited' });

    res.json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const existing = await Cashflow.getById(id);
    if (!existing)                    return res.status(404).json({ success: false, message: 'Entry not found' });
    if (existing.source !== 'manual') return res.status(400).json({ success: false, message: 'Auto-created entries cannot be deleted' });

    const deleted = await Cashflow.softDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Entry not found' });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// GET /api/finance/profit?from=YYYY-MM-DD&to=YYYY-MM-DD
// Defaults to current calendar month-to-date in Manila local time.
//
//   profit = revenue − COGS − non-restock opex − capex
//
// Restocks are excluded from opex here because their cost is already
// realized as COGS the moment each item is sold — including them would
// double-charge the owner against the same purchase.
const getProfit = async (req, res, next) => {
  try {
    const today = manilaFmt.format(new Date());
    const from  = (req.query.from && DATE_RE.test(req.query.from)) ? req.query.from : today.slice(0, 7) + '-01';
    const to    = (req.query.to   && DATE_RE.test(req.query.to))   ? req.query.to   : today;

    const prev = priorWindow(from, to);
    const [current, currentExp, previous, previousExp] = await Promise.all([
      saleModel.getProfit(from, to),
      Cashflow.getPeriodOpex(from, to),
      saleModel.getProfit(prev.from, prev.to),
      Cashflow.getPeriodOpex(prev.from, prev.to),
    ]);

    const profit          = current.grossProfit  - currentExp.operatingExpense  - currentExp.capitalExpense;
    const previousProfit  = previous.grossProfit - previousExp.operatingExpense - previousExp.capitalExpense;
    const margin          = current.revenue > 0 ? parseFloat(((profit / current.revenue) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      data: {
        revenue:     current.revenue,
        cogs:        current.cogs,
        grossProfit: current.grossProfit,
        opex:        currentExp.operatingExpense,
        capex:       currentExp.capitalExpense,
        profit,
        margin,
        previous:      { profit: previousProfit, range: prev },
        period:        { from, to },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getSummary, getProfit, create, update, remove };
