const db = require('../config/db.config');

// Helper: fetch all sale_items rows for a list of sale IDs in one query
const _fetchItems = async (saleIds) => {
  if (saleIds.length === 0) return [];
  const placeholders = saleIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT * FROM sale_items WHERE sale_id IN (${placeholders}) ORDER BY id ASC`,
    saleIds
  );
  return rows;
};

// Helper: converts a sale row + item rows into the JS response shape
const _buildSaleObject = (saleRow, itemRows) => ({
  id:        saleRow.id,
  receiptNo: saleRow.receipt_no,
  subtotal:  parseFloat(saleRow.subtotal),
  tax:       parseFloat(saleRow.tax),
  taxRate:   parseFloat(saleRow.tax_rate),
  cartTaxOn: Boolean(saleRow.cart_tax_on),
  total:     parseFloat(saleRow.total),
  payment:   parseFloat(saleRow.payment),
  change:    parseFloat(saleRow.change_given),
  cashier:   saleRow.cashierName,
  timestamp: saleRow.created_at,
  items: itemRows.map(i => ({
    productId: i.product_id,
    name:      i.product_name,
    price:     parseFloat(i.unit_price),
    quantity:  i.quantity,
    lineTotal: parseFloat(i.line_total),
  })),
});


// ─── Read ──────────────────────────────────────────────────────────────────

const getById = async (id) => {
  const [rows] = await db.query(
    `SELECT s.*, u.full_name AS cashierName
     FROM sales s
     INNER JOIN users u ON s.cashier_id = u.id
     WHERE s.id = ?`,
    [id]
  );
  if (!rows[0]) return null;
  const [items] = await db.query(
    'SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC',
    [id]
  );
  return _buildSaleObject(rows[0], items);
};

const getAll = async (filters = {}) => {
  let sql = `SELECT s.*, u.full_name AS cashierName
             FROM sales s
             INNER JOIN users u ON s.cashier_id = u.id`;
  const params = [];
  const conds  = [];

  if (filters.from) { conds.push('DATE(s.created_at) >= ?'); params.push(filters.from); }
  if (filters.to)   { conds.push('DATE(s.created_at) <= ?'); params.push(filters.to); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY s.created_at DESC';

  const [saleRows] = await db.query(sql, params);
  if (saleRows.length === 0) return [];

  const allItems = await _fetchItems(saleRows.map(r => r.id));
  return saleRows.map(row =>
    _buildSaleObject(row, allItems.filter(i => i.sale_id === row.id))
  );
};

// ─── Create (full transaction) ─────────────────────────────────────────────

const create = async (saleRecord, userId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Step 1: Insert the sale header
    const [saleResult] = await connection.query(
      `INSERT INTO sales
       (subtotal, tax, tax_rate, cart_tax_on,
        total, payment, change_given, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleRecord.subtotal,  saleRecord.tax,
        saleRecord.taxRate,   saleRecord.cartTaxOn ? 1 : 0,
        saleRecord.total,     saleRecord.payment,
        saleRecord.change,    userId,
      ]
    );
    const saleId    = saleResult.insertId;
    const receiptNo = `RCPT-${String(saleId).padStart(6, '0')}`;
    await connection.query(
      'UPDATE sales SET receipt_no = ? WHERE id = ?',
      [receiptNo, saleId]
    );

    // Step 2: Insert line items, deduct stock, log adjustments
    for (const item of saleRecord.items) {
      await connection.query(
        `INSERT INTO sale_items
         (sale_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, item.productId, item.name, item.price, item.quantity, item.lineTotal]
      );
      const [stockRows] = await connection.query(
        'SELECT stock FROM products WHERE id = ?',
        [item.productId]
      );
      const stockBefore = stockRows[0] ? stockRows[0].stock : 0;
      const stockAfter  = Math.max(0, stockBefore - item.quantity);
      await connection.query(
        'UPDATE products SET stock = ? WHERE id = ?',
        [stockAfter, item.productId]
      );
      await connection.query(
        `INSERT INTO inventory_adjustments
         (product_id, type, qty, stock_before, stock_after, notes, adjusted_by)
         VALUES (?, 'sale', ?, ?, ?, ?, ?)`,
        [item.productId, item.quantity, stockBefore, stockAfter, `Sale ${receiptNo}`, userId]
      );
    }

    await connection.commit();
    connection.release();
    return getById(saleId);
  } catch (err) {
    await connection.rollback();
    connection.release();
    throw err;
  }
};

// ─── Aggregations ──────────────────────────────────────────────────────────

const getTodaySummary = async () => {
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(total), 0) AS totalRevenue,
       COUNT(*)                AS transactionCount,
       COALESCE(AVG(total), 0) AS avgSaleValue
     FROM sales WHERE DATE(created_at) = CURDATE()`
  );
  return {
    totalRevenue:     parseFloat(rows[0].totalRevenue),
    transactionCount: rows[0].transactionCount,
    avgSaleValue:     parseFloat(rows[0].avgSaleValue),
  };
};

const getSummary = async (dateStr) => {
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(total), 0) AS totalRevenue,
       COUNT(*)                AS transactionCount,
       COALESCE(AVG(total), 0) AS avgSaleValue
     FROM sales WHERE DATE(created_at) = ?`,
    [dateStr]
  );
  return {
    totalRevenue:     parseFloat(rows[0].totalRevenue),
    transactionCount: rows[0].transactionCount,
    avgSaleValue:     parseFloat(rows[0].avgSaleValue),
  };
};

const getDailyMap = async () => {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS saleDate, SUM(total) AS totalRevenue
     FROM sales GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY saleDate ASC`
  );
  const map = {};
  rows.forEach(r => { map[r.saleDate] = parseFloat(r.totalRevenue); });
  return map;
};

const getKPIs = async (from, to) => {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(sub.total), 0)   AS totalRevenue,
            COUNT(*)                       AS transactionCount,
            COALESCE(AVG(sub.total), 0)    AS avgOrderValue,
            COALESCE(SUM(sub.qty), 0)      AS totalUnits
     FROM (
       SELECT s.id, s.total, COALESCE(SUM(si.quantity), 0) AS qty
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE DATE(s.created_at) BETWEEN ? AND ?
       GROUP BY s.id, s.total
     ) sub`, [from, to]
  );
  return {
    totalRevenue:     parseFloat(rows[0].totalRevenue),
    transactionCount: rows[0].transactionCount,
    avgOrderValue:    parseFloat(rows[0].avgOrderValue),
    totalUnits:       parseInt(rows[0].totalUnits, 10),
  };
};

const getTopByRevenue = async (from, to, limit = 5) => {
  const [rows] = await db.query(
    `SELECT si.product_name AS name, SUM(si.line_total) AS revenue
     FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id
     WHERE DATE(s.created_at) BETWEEN ? AND ?
     GROUP BY si.product_name ORDER BY revenue DESC LIMIT ?`, [from, to, limit]
  );
  return rows.map(r => ({ name: r.name, revenue: parseFloat(r.revenue) }));
};

const getTopByQty = async (from, to, limit = 5) => {
  const [rows] = await db.query(
    `SELECT si.product_name AS name, SUM(si.quantity) AS qty
     FROM sale_items si
     INNER JOIN sales s ON si.sale_id = s.id
     WHERE DATE(s.created_at) BETWEEN ? AND ?
     GROUP BY si.product_name
     ORDER BY qty DESC
     LIMIT ?`, [from, to, limit]
  );
  return rows.map(r => ({ name: r.name, qty: parseInt(r.qty, 10) }));
};

const getByDayOfWeek = async (from, to) => {
  const [rows] = await db.query(
    `SELECT (DAYOFWEEK(created_at) - 1) AS dayIndex, SUM(total) AS total
     FROM sales WHERE DATE(created_at) BETWEEN ? AND ?
     GROUP BY (DAYOFWEEK(created_at) - 1) ORDER BY dayIndex ASC`, [from, to]
  );
  const totals = [0, 0, 0, 0, 0, 0, 0];
  rows.forEach(r => { totals[r.dayIndex] = parseFloat(r.total); });
  return totals;
};

module.exports = {
  create, getAll, getById, getTodaySummary,
  getSummary, getDailyMap, getKPIs,
  getTopByRevenue, getTopByQty, getByDayOfWeek,
};
