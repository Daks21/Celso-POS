const db = require('../config/db.config');

const VALID_TYPES = ['capital_in', 'owner_draw', 'opex', 'capex'];

// null means free-form (any non-empty string accepted)
const CATEGORY_BY_TYPE = {
  capital_in: ['own', 'borrowed'],
  owner_draw: ['personal', 'loan_payment', 'reinvest', 'other'],
  opex:       null,
  capex:      null,
};

function buildFilters(filters) {
  const conditions = ['is_active = 1'];
  const params = [];
  if (filters.type && VALID_TYPES.includes(filters.type)) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.category) { conditions.push('category = ?');      params.push(filters.category); }
  if (filters.from)     { conditions.push('occurred_at >= ?');  params.push(filters.from);     }
  if (filters.to)       { conditions.push('occurred_at <= ?');  params.push(filters.to);       }
  return { where: 'WHERE ' + conditions.join(' AND '), params };
}

const getAll = async (filters = {}) => {
  const { where, params } = buildFilters(filters);
  const [rows] = await db.query(
    `SELECT cm.*, u.full_name AS recordedByName
     FROM cash_movements cm
     LEFT JOIN users u ON cm.recorded_by = u.id
     ${where}
     ORDER BY occurred_at DESC, cm.created_at DESC`,
    params
  );
  return rows;
};

const getById = async (id) => {
  const [rows] = await db.query(
    'SELECT * FROM cash_movements WHERE id = ? AND is_active = 1', [id]
  );
  return rows[0] || null;
};

const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO cash_movements
       (type, category, amount, description, occurred_at, source, source_id, recorded_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      data.type,
      data.category    || null,
      data.amount,
      data.description || null,
      data.occurred_at,
      data.source      || 'manual',
      data.source_id   || null,
      data.recorded_by || null,
    ]
  );
  return getById(result.insertId);
};

const createWithConnection = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO cash_movements
       (type, category, amount, description, occurred_at, source, source_id, recorded_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      data.type,
      data.category    || null,
      data.amount,
      data.description || null,
      data.occurred_at,
      data.source      || 'manual',
      data.source_id   || null,
      data.recorded_by || null,
    ]
  );
  return result.insertId;
};

const update = async (id, data) => {
  const [result] = await db.query(
    `UPDATE cash_movements
     SET type=?, category=?, amount=?, description=?, occurred_at=?
     WHERE id=? AND is_active=1 AND source='manual'`,
    [data.type, data.category || null, data.amount, data.description || null, data.occurred_at, id]
  );
  if (result.affectedRows === 0) return null;
  return getById(id);
};

const softDelete = async (id) => {
  const [result] = await db.query(
    `UPDATE cash_movements SET is_active=0
     WHERE id=? AND is_active=1 AND source='manual'`,
    [id]
  );
  return result.affectedRows > 0;
};

const getSummary = async (filters = {}) => {
  const { where, params } = buildFilters(filters);

  // Period totals
  const [[row]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'capital_in'                   THEN amount ELSE 0 END), 0) AS moneyIn,
       COALESCE(SUM(CASE WHEN type IN ('owner_draw','opex','capex') THEN amount ELSE 0 END), 0) AS moneyOut
     FROM cash_movements ${where}`,
    params
  );

  // Utang is period-independent: all-time borrowed minus all loan payments
  const [[utangRow]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type='capital_in' AND category='borrowed'     THEN amount ELSE 0 END), 0) AS totalBorrowed,
       COALESCE(SUM(CASE WHEN type='owner_draw' AND category='loan_payment' THEN amount ELSE 0 END), 0) AS totalRepaid
     FROM cash_movements WHERE is_active=1`
  );

  // byType breakdown (for the filtered period)
  const [byTypeRows] = await db.query(
    `SELECT type, COALESCE(SUM(amount), 0) AS total
     FROM cash_movements ${where}
     GROUP BY type`,
    params
  );
  const byType = { capital_in: 0, owner_draw: 0, opex: 0, capex: 0 };
  byTypeRows.forEach(r => { byType[r.type] = Number(r.total); });

  // byCategory breakdown (filtered period, non-null categories only)
  const [byCatRows] = await db.query(
    `SELECT category, COALESCE(SUM(amount), 0) AS total
     FROM cash_movements ${where} AND category IS NOT NULL
     GROUP BY category`,
    params
  );
  const byCategory = {};
  byCatRows.forEach(r => { if (r.category) byCategory[r.category] = Number(r.total); });

  const moneyIn  = Number(row.moneyIn);
  const moneyOut = Number(row.moneyOut);
  return {
    moneyIn,
    moneyOut,
    net:   moneyIn - moneyOut,
    utang: Math.max(0, Number(utangRow.totalBorrowed) - Number(utangRow.totalRepaid)),
    byType,
    byCategory,
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
};
