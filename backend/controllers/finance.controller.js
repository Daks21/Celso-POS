const Cashflow = require('../models/cashflow.model');

const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

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

module.exports = { getAll, getSummary, create, update, remove };
