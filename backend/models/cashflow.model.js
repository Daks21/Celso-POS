const db = require('../config/db.config');

const VALID_TYPES = ['capital_in', 'owner_draw', 'opex', 'capex'];

const CATEGORY_BY_TYPE = {
  capital_in: ['own_savings', 'borrowed', 'other_income'],
  owner_draw: ['personal_use', 'loan_payment', 'reinvestment', 'other_draw'],
  opex:       ['utilities', 'supplies', 'rent', 'salaries', 'transport', 'restock', 'other_opex'],
  capex:      ['equipment', 'renovation', 'fixtures', 'other_capex'],
};

function buildFilters(filters) {
  const conditions = ['is_active = 1'];
  const params = [];
  if (filters.type && VALID_TYPES.includes(filters.type)) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.from) { conditions.push('occurred_at >= ?'); params.push(filters.from); }
  if (filters.to)   { conditions.push('occurred_at <= ?'); params.push(filters.to);   }
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
  const [[row]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'capital_in'                          THEN amount ELSE 0 END), 0) AS moneyIn,
       COALESCE(SUM(CASE WHEN type IN ('owner_draw','opex','capex')        THEN amount ELSE 0 END), 0) AS moneyOut
     FROM cash_movements ${where}`,
    params
  );

  // Utang is always period-independent: total borrowed minus total repaid (all time)
  const [[utangRow]] = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type='capital_in' AND category='borrowed'    THEN amount ELSE 0 END), 0) AS totalBorrowed,
       COALESCE(SUM(CASE WHEN type='owner_draw' AND category='loan_payment' THEN amount ELSE 0 END), 0) AS totalRepaid
     FROM cash_movements WHERE is_active=1`
  );

  const moneyIn  = Number(row.moneyIn);
  const moneyOut = Number(row.moneyOut);
  return {
    moneyIn,
    moneyOut,
    net:   moneyIn - moneyOut,
    utang: Math.max(0, Number(utangRow.totalBorrowed) - Number(utangRow.totalRepaid)),
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
