const db = require('../config/db.config');

const VALID_TYPES = ['capital_in', 'owner_draw', 'opex', 'capex', 'sales_revenue'];

// null means free-form (any non-empty string accepted)
const CATEGORY_BY_TYPE = {
  capital_in:    ['own', 'borrowed'],
  owner_draw:    ['personal', 'debt_payment', 'restock', 'opex', 'other'],
  opex:          null,
  capex:         null,
  sales_revenue: null,
};

// Phase 6.5 — every query is store-scoped (storeId first). Filter columns are
// qualified with the `cm` alias because getAll/getSummary join or could join
// users (which now also has an is_active column) — a bare `is_active` would be
// ambiguous. All FROM clauses that consume this WHERE therefore alias the table
// `cm`.
function buildFilters(storeId, filters) {
  const conditions = ['cm.is_active = 1', 'cm.store_id = ?'];
  const params = [storeId];

  // Accepts either `type` (single) or `types` (array). Used by the frontend
  // "Business Expense" filter to match opex+capex in one query without
  // requiring two parallel fetches.
  let types = [];
  if (Array.isArray(filters.types)) {
    types = filters.types.filter(t => VALID_TYPES.includes(t));
  } else if (filters.type && VALID_TYPES.includes(filters.type)) {
    types = [filters.type];
  }
  if (types.length === 1) {
    conditions.push('cm.type = ?');
    params.push(types[0]);
  } else if (types.length > 1) {
    conditions.push('cm.type IN (' + types.map(() => '?').join(',') + ')');
    params.push(...types);
  }

  if (filters.category) { conditions.push('cm.category = ?');      params.push(filters.category); }
  if (filters.from)     { conditions.push('cm.occurred_at >= ?');  params.push(filters.from);     }
  if (filters.to)       { conditions.push('cm.occurred_at <= ?');  params.push(filters.to);       }
  return { where: 'WHERE ' + conditions.join(' AND '), params };
}

const getAll = async (storeId, filters = {}) => {
  const { where, params } = buildFilters(storeId, filters);
  const [rows] = await db.query(
    `SELECT cm.id, cm.type, cm.category, cm.amount, cm.monthly_due, cm.term_months,
            cm.description,
            DATE_FORMAT(cm.occurred_at, '%Y-%m-%d') AS occurred_at,
            cm.source, cm.source_id, cm.recorded_by, cm.is_active, cm.created_at,
            u.full_name AS recordedByName
     FROM cash_movements cm
     LEFT JOIN users u ON cm.recorded_by = u.id
     ${where}
     ORDER BY cm.occurred_at DESC, cm.created_at DESC`,
    params
  );
  return rows;
};

const getById = async (storeId, id) => {
  const [rows] = await db.query(
    `SELECT id, type, category, amount, monthly_due, term_months, description,
            DATE_FORMAT(occurred_at, '%Y-%m-%d') AS occurred_at,
            source, source_id, recorded_by, is_active, created_at
     FROM cash_movements WHERE id = ? AND store_id = ? AND is_active = 1`, [id, storeId]
  );
  return rows[0] || null;
};

const create = async (storeId, data) => {
  const [result] = await db.query(
    `INSERT INTO cash_movements
       (store_id, type, category, amount, monthly_due, term_months, description, occurred_at, source, source_id, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      storeId,
      data.type,
      data.category    || null,
      data.amount,
      data.monthly_due || null,
      data.term_months || null,
      data.description || null,
      data.occurred_at,
      data.source      || 'manual',
      data.source_id   || null,
      data.recorded_by || null,
    ]
  );
  return getById(storeId, result.insertId);
};

const createWithConnection = async (conn, storeId, data) => {
  const [result] = await conn.query(
    `INSERT INTO cash_movements
       (store_id, type, category, amount, monthly_due, term_months, description, occurred_at, source, source_id, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      storeId,
      data.type,
      data.category    || null,
      data.amount,
      data.monthly_due || null,
      data.term_months || null,
      data.description || null,
      data.occurred_at,
      data.source      || 'manual',
      data.source_id   || null,
      data.recorded_by || null,
    ]
  );
  return result.insertId;
};

const update = async (storeId, id, data) => {
  const [result] = await db.query(
    `UPDATE cash_movements
     SET type=?, category=?, amount=?, monthly_due=?, term_months=?, description=?, occurred_at=?
     WHERE id=? AND store_id=? AND is_active=1 AND source='manual'`,
    [data.type, data.category || null, data.amount, data.monthly_due || null, data.term_months || null, data.description || null, data.occurred_at, id, storeId]
  );
  if (result.affectedRows === 0) return null;
  return getById(storeId, id);
};

const softDelete = async (storeId, id) => {
  const [result] = await db.query(
    `UPDATE cash_movements SET is_active=0
     WHERE id=? AND store_id=? AND is_active=1 AND source='manual'`,
    [id, storeId]
  );
  return result.affectedRows > 0;
};

const getSummary = async (storeId, filters = {}) => {
  const { where, params } = buildFilters(storeId, filters);

  // Period totals
  const [[row]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN cm.type IN ('capital_in','sales_revenue')  THEN cm.amount ELSE 0 END), 0) AS moneyIn,
       COALESCE(SUM(CASE WHEN cm.type IN ('owner_draw','opex','capex')   THEN cm.amount ELSE 0 END), 0) AS moneyOut
     FROM cash_movements cm ${where}`,
    params
  );

  // Debt balance is period-independent: all-time obligation minus all debt payments.
  // Obligation for a borrowed loan is its full repayment total (monthly_due *
  // term_months), which bakes in 5-6 style interest. Legacy borrowed rows with
  // no terms fall back to `amount` (principal) so old data keeps computing.
  // Store-scoped and NOT period-filtered (reflects current outstanding balance).
  const [[utangRow]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type='capital_in' AND category='borrowed'
         THEN CASE WHEN monthly_due IS NOT NULL AND term_months IS NOT NULL AND term_months > 0
                   THEN monthly_due * term_months
                   ELSE amount END
         ELSE 0 END), 0) AS totalBorrowed,
       COALESCE(SUM(CASE WHEN type='owner_draw' AND category='debt_payment'  THEN amount ELSE 0 END), 0) AS totalRepaid
     FROM cash_movements WHERE is_active=1 AND store_id=?`,
    [storeId]
  );

  // byType breakdown (for the filtered period)
  const [byTypeRows] = await db.query(
    `SELECT cm.type, COALESCE(SUM(cm.amount), 0) AS total
     FROM cash_movements cm ${where}
     GROUP BY cm.type`,
    params
  );
  const byType = { capital_in: 0, owner_draw: 0, opex: 0, capex: 0, sales_revenue: 0 };
  byTypeRows.forEach(r => { byType[r.type] = Number(r.total); });

  // byCategory breakdown (filtered period, non-null categories only)
  const [byCatRows] = await db.query(
    `SELECT cm.category, COALESCE(SUM(cm.amount), 0) AS total
     FROM cash_movements cm ${where} AND cm.category IS NOT NULL
     GROUP BY cm.category`,
    params
  );
  const byCategory = {};
  byCatRows.forEach(r => { if (r.category) byCategory[r.category] = Number(r.total); });

  const moneyIn  = Number(row.moneyIn);
  const moneyOut = Number(row.moneyOut);
  return {
    moneyIn,
    moneyOut,
    net:          moneyIn - moneyOut,
    debtBalance:  Math.max(0, Number(utangRow.totalBorrowed) - Number(utangRow.totalRepaid)),
    byType,
    byCategory,
  };
};

// Period expenses for the Profit card (revenue − COGS − these).
// Excludes opex with category='restock' because restock cost is already
// captured as COGS at the moment the item sells — counting it here would
// double-charge the owner.
//   - opex (non-restock)                : rent, utilities, supplies, etc.
//   - owner_draw category='opex'        : "I paid the bill from my pocket"
//   - capex                             : equipment in-period (no depreciation schema)
const getPeriodOpex = async (storeId, from, to) => {
  const [[row]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE
         WHEN type='opex' AND (category IS NULL OR category <> 'restock') THEN amount
         WHEN type='owner_draw' AND category='opex'                       THEN amount
         ELSE 0
       END), 0) AS operatingExpense,
       COALESCE(SUM(CASE WHEN type='capex' THEN amount ELSE 0 END), 0) AS capitalExpense
     FROM cash_movements
     WHERE is_active=1 AND store_id=? AND occurred_at BETWEEN ? AND ?`,
    [storeId, from, to]
  );
  return {
    operatingExpense: Number(row.operatingExpense),
    capitalExpense:   Number(row.capitalExpense),
  };
};

module.exports = {
  VALID_TYPES,
  CATEGORY_BY_TYPE,
  getAll,
  getById,
  create,
  createWithConnection,
  update,
  softDelete,
  getSummary,
  getPeriodOpex,
};
