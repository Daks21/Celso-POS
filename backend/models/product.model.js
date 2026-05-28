const db = require('../config/db.config');
const settings = require('./settings.model');
const { dateInTz } = require('../utils/tz');

const getAll = async (filters = {}) => {
  let sql = 'SELECT * FROM products WHERE is_active = 1';
  const params = [];
  if (filters.search) {
    sql += ' AND LOWER(name) LIKE ?';
    params.push(`%${filters.search.toLowerCase()}%`);
  }
  if (filters.category) {
    sql += ' AND LOWER(category) = ?';
    params.push(filters.category.toLowerCase());
  }
  sql += ' ORDER BY name ASC';
  const [rows] = await db.query(sql, params);
  return rows;
};

const getById = async (id) => {
  const [rows] = await db.query(
    'SELECT * FROM products WHERE id = ? AND is_active = 1', [id]
  );
  return rows[0] || null;
};

const create = async (data) => {
  const [result] = await db.query(
    'INSERT INTO products (name, category, price, cost, stock, unit)'
    + ' VALUES (?,?,?,?,?,?)',
    [data.name, data.category, data.price, data.cost, 0, data.unit]
  );
  return getById(result.insertId);
};

const update = async (id, data) => {
  const [result] = await db.query(
    'UPDATE products SET name=?, category=?, price=?, cost=?, unit=?'
    + ' WHERE id=? AND is_active = 1',
    [data.name, data.category, data.price, data.cost, data.unit, id]
  );
  if (result.affectedRows === 0) return null;
  return getById(id);
};

const remove = async (id) => {
  const [result] = await db.query(
    'UPDATE products SET is_active = 0 WHERE id = ? AND is_active = 1', [id]
  );
  return result.affectedRows > 0;
};

const getLowStock = async (threshold = 50) => {
  const [rows] = await db.query(
    'SELECT * FROM products'
    + ' WHERE is_active = 1 AND stock > 0 AND stock < ?'
    + ' ORDER BY stock ASC',
    [threshold]
  );
  return rows;
};

const getOutOfStock = async () => {
  const [rows] = await db.query(
    'SELECT * FROM products WHERE is_active = 1 AND stock = 0'
  );
  return rows;
};

const getStockLevels = async (threshold = 50) => {
  const [rows] = await db.query(
    'SELECT id, name, category, stock, unit FROM products'
    + ' WHERE is_active = 1 ORDER BY name ASC'
  );
  return rows.map(p => ({
    ...p,
    status: p.stock === 0 ? 'out-of-stock'
           : p.stock < threshold ? 'low'
           : 'in-stock',
  }));
};

const adjustStock = async (id, qty, type, notes = null, userId = null, expenseData = null) => {
  const product = await getById(id);
  if (!product) return null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const stockBefore = product.stock;
    const stockAfter  = Math.max(0, stockBefore + qty);

    await conn.query(
      'UPDATE products SET stock = ? WHERE id = ?', [stockAfter, id]
    );

    const [adjResult] = await conn.query(
      `INSERT INTO inventory_adjustments
         (product_id, type, qty, stock_before, stock_after, notes, adjusted_by,
          unit_cost, total_paid, payment_method, supplier_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, type, Math.abs(qty), stockBefore, stockAfter, notes, userId,
        expenseData ? (expenseData.unitCost      || null) : null,
        expenseData ? (expenseData.totalPaid     || null) : null,
        expenseData ? (expenseData.paymentMethod || null) : null,
        expenseData ? (expenseData.supplierName  || null) : null,
      ]
    );

    let cashMovement = null;
    if (expenseData && expenseData.recordExpense && expenseData.totalPaid > 0) {
      const desc = expenseData.supplierName
        ? `Restock from ${expenseData.supplierName}: ${product.name}`
        : `Restock: ${product.name}`;
      // Store-local YYYY-MM-DD. created_at is stored UTC, so derive the
      // occurred_at calendar day in the store timezone to avoid day-drift
      // when an owner restocks in the evening local time.
      const storeToday = dateInTz(settings.getTimezone());
      const [cmResult] = await conn.query(
        `INSERT INTO cash_movements
           (type, category, amount, description, occurred_at, source, source_id, recorded_by)
         VALUES ('opex', 'restock', ?, ?, ?, 'restock', ?, ?)`,
        [expenseData.totalPaid, desc, storeToday, adjResult.insertId, userId]
      );
      cashMovement = { id: cmResult.insertId, type: 'opex', category: 'restock', amount: expenseData.totalPaid };
    }

    await conn.commit();

    const updatedProduct = await getById(id);
    return { product: updatedProduct, cashMovement };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const getInventoryCounts = async (threshold = 50) => {
  const [[row]] = await db.query(
    `SELECT
       COUNT(*)                                                   AS totalProducts,
       COALESCE(SUM(stock), 0)                                    AS totalItems,
       SUM(CASE WHEN stock = 0              THEN 1 ELSE 0 END)    AS outOfStockCount,
       SUM(CASE WHEN stock > 0 AND stock < ? THEN 1 ELSE 0 END)  AS lowStockCount
     FROM products
     WHERE is_active = 1`,
    [threshold]
  );
  return {
    totalProducts:   Number(row.totalProducts),
    totalItems:      Number(row.totalItems),
    outOfStockCount: Number(row.outOfStockCount),
    lowStockCount:   Number(row.lowStockCount),
  };
};

const getAdjustmentLog = async (productId) => {
  let sql = `
    SELECT ia.id, ia.product_id AS productId,
           ia.type, ia.qty,
           ia.stock_before AS \`before\`,
           ia.stock_after  AS \`after\`,
           ia.notes,
           ia.created_at   AS timestamp,
           p.name          AS productName,
           u.full_name     AS adjustedByName
    FROM inventory_adjustments ia
    LEFT JOIN products p ON ia.product_id = p.id
    LEFT JOIN users    u ON ia.adjusted_by = u.id
  `;
  const params = [];
  if (productId !== undefined) {
    sql += ' WHERE ia.product_id = ?';
    params.push(productId);
  }
  sql += ' ORDER BY ia.created_at DESC';
  const [rows] = await db.query(sql, params);
  return rows;
};

module.exports = {
  getAll, getById, create, update, remove,
  getLowStock, getOutOfStock, getStockLevels,
  getInventoryCounts, adjustStock, getAdjustmentLog,
};
