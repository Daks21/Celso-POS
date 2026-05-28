const Cashflow  = require('../models/cashflow.model');
const saleModel = require('../models/sale.model');
const settings  = require('../models/settings.model');
const { dateInTz } = require('../utils/tz');

const DATE_RE          = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MAX_AMOUNT       = 10_000_000;   // ₱10M ceiling — well below DECIMAL(10,2) overflow
const MAX_DESC_LEN     = 500;          // description text guard against runaway input
const MAX_CATEGORY_LEN = 64;           // free-form categories (opex/capex)
const FUTURE_DAYS_OK   = 365;          // accept up to 1 year ahead (typo tolerance)
const PAST_YEARS_OK    = 10;           // accept up to 10 years behind
const MAX_TERM_MONTHS  = 120;          // 10 years — generous ceiling for informal loans

// Store-local date in YYYY-MM-DD. Avoids server-TZ drift on Profit defaults.
const storeToday = () => dateInTz(settings.getTimezone());

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
  // null means free-form (opex/capex) — any non-empty string is valid,
  // but cap the length so a malformed client can't write 10 KB into the column.
  if (allowed === null) {
    if (category && String(category).length > MAX_CATEGORY_LEN)
      return `category must be ${MAX_CATEGORY_LEN} characters or fewer`;
    return null;
  }
  if (category && !allowed.includes(category))
    return `category for '${type}' must be one of: ${allowed.join(', ')}`;
  return null;
}

// Sanity-check the `occurred_at` date so a typo like '2099-05-27' or
// '0023-05-27' can't poison aggregates and charts. Assumes the format
// has already been validated by DATE_RE.
function validateOccurredAt(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return 'occurred_at is not a valid calendar date';
  const now    = Date.now();
  const future = d.getTime() - now;
  const past   = now - d.getTime();
  if (future > FUTURE_DAYS_OK * 86400000)
    return `occurred_at cannot be more than ${FUTURE_DAYS_OK} days in the future`;
  if (past > PAST_YEARS_OK * 365 * 86400000)
    return `occurred_at cannot be more than ${PAST_YEARS_OK} years in the past`;
  return null;
}

// Loan repayment terms apply ONLY to borrowed capital. For any other entry they
// are forced to null so stray client values can't be persisted. For a borrowed
// loan they're optional (simple/interest-free loans omit them and the debt calc
// falls back to the principal), but if one is given both must be, and both must
// be sane positive numbers. Returns { error } or { monthly_due, term_months }.
function resolveLoanTerms(type, category, monthly_due, term_months) {
  const isBorrowed = type === 'capital_in' && category === 'borrowed';
  if (!isBorrowed) return { monthly_due: null, term_months: null };

  const hasMonthly = monthly_due != null && monthly_due !== '';
  const hasTerm    = term_months != null && term_months !== '';
  if (!hasMonthly && !hasTerm) return { monthly_due: null, term_months: null };
  if (hasMonthly !== hasTerm)
    return { error: 'monthly_due and term_months must be provided together for a borrowed loan' };

  const md = Number(monthly_due);
  const tm = Number(term_months);
  if (!Number.isFinite(md) || md <= 0)
    return { error: 'monthly_due must be a positive number' };
  if (md > MAX_AMOUNT)
    return { error: `monthly_due cannot exceed ₱${MAX_AMOUNT.toLocaleString('en-PH')}` };
  if (!Number.isInteger(tm) || tm < 1 || tm > MAX_TERM_MONTHS)
    return { error: `term_months must be a whole number between 1 and ${MAX_TERM_MONTHS}` };

  return { monthly_due: md, term_months: tm };
}

const getAll = async (req, res, next) => {
  try {
    const { type, category, from, to } = req.query;
    const filters = {};
    if (type) {
      // Accept comma-separated types (e.g. ?type=opex,capex for the
      // Business Expense filter). Single value still works the same.
      const types = type.split(',').map(t => t.trim()).filter(t => Cashflow.VALID_TYPES.includes(t));
      if (types.length > 0) filters.types = types;
    }
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
    const { type, category, amount, description, occurred_at, monthly_due, term_months } = req.body;

    if (!type || !Cashflow.VALID_TYPES.includes(type))
      return res.status(400).json({ success: false, message: `type must be one of: ${Cashflow.VALID_TYPES.join(', ')}` });

    if (type === 'sales_revenue')
      return res.status(400).json({ success: false, message: 'sales_revenue entries are created automatically by the POS' });

    if (!amount || typeof amount !== 'number' || amount <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    if (amount > MAX_AMOUNT)
      return res.status(400).json({ success: false, message: `amount cannot exceed ₱${MAX_AMOUNT.toLocaleString('en-PH')}` });

    if (!occurred_at || !DATE_RE.test(occurred_at))
      return res.status(400).json({ success: false, message: 'occurred_at must be a valid date in YYYY-MM-DD format' });

    const dateError = validateOccurredAt(occurred_at);
    if (dateError) return res.status(400).json({ success: false, message: dateError });

    if (description != null && String(description).length > MAX_DESC_LEN)
      return res.status(400).json({ success: false, message: `description must be ${MAX_DESC_LEN} characters or fewer` });

    const catError = validateCategory(type, category);
    if (catError) return res.status(400).json({ success: false, message: catError });

    const terms = resolveLoanTerms(type, category, monthly_due, term_months);
    if (terms.error) return res.status(400).json({ success: false, message: terms.error });

    const entry = await Cashflow.create({
      type,
      category:    category    || null,
      amount,
      monthly_due: terms.monthly_due,
      term_months: terms.term_months,
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

    const { type, category, amount, description, occurred_at, monthly_due, term_months } = req.body;

    if (!type || !Cashflow.VALID_TYPES.includes(type))
      return res.status(400).json({ success: false, message: `type must be one of: ${Cashflow.VALID_TYPES.join(', ')}` });

    if (!amount || typeof amount !== 'number' || amount <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    if (amount > MAX_AMOUNT)
      return res.status(400).json({ success: false, message: `amount cannot exceed ₱${MAX_AMOUNT.toLocaleString('en-PH')}` });

    if (!occurred_at || !DATE_RE.test(occurred_at))
      return res.status(400).json({ success: false, message: 'occurred_at must be a valid date in YYYY-MM-DD format' });

    const dateError = validateOccurredAt(occurred_at);
    if (dateError) return res.status(400).json({ success: false, message: dateError });

    if (description != null && String(description).length > MAX_DESC_LEN)
      return res.status(400).json({ success: false, message: `description must be ${MAX_DESC_LEN} characters or fewer` });

    const catError = validateCategory(type, category);
    if (catError) return res.status(400).json({ success: false, message: catError });

    const terms = resolveLoanTerms(type, category, monthly_due, term_months);
    if (terms.error) return res.status(400).json({ success: false, message: terms.error });

    const entry = await Cashflow.update(id, {
      type,
      category:    category    || null,
      amount,
      monthly_due: terms.monthly_due,
      term_months: terms.term_months,
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
// Defaults to current calendar month-to-date in the store-local timezone.
//
//   profit = revenue − COGS − non-restock opex − capex
//
// Restocks are excluded from opex here because their cost is already
// realized as COGS the moment each item is sold — including them would
// double-charge the owner against the same purchase.
const getProfit = async (req, res, next) => {
  try {
    const today = storeToday();
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
