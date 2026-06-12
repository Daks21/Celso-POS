const db = require('../config/db.config');
const settings = require('./settings.model');
const { dateInTz } = require('../utils/tz');

// Phase 6.5 — every function is scoped to a store. storeId is the FIRST argument
// on each so call sites read as obviously tenant-scoped, and every WHERE filters
// store_id / every INSERT sets it. getById is store-scoped too because checkout
// validation relies on it (a sale must never reference another store's product).

const getAll = async (storeId, filters = {}) => {
  let sql = 'SELECT * FROM products WHERE store_id = ? AND is_active = 1';
  const params = [storeId];
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

const getById = async (storeId, id) => {
  const [rows] = await db.query(
    'SELECT * FROM products WHERE id = ? AND store_id = ? AND is_active = 1', [id, storeId]
  );
  return rows[0] || null;
};

const create = async (storeId, data) => {
  const [result] = await db.query(
    'INSERT INTO products (store_id, name, category, price, cost, stock, unit)'
    + ' VALUES (?,?,?,?,?,?,?)',
    [storeId, data.name, data.category, data.price, data.cost, 0, data.unit]
  );
  return getById(storeId, result.insertId);
};

const update = async (storeId, id, data) => {
  const [result] = await db.query(
    'UPDATE products SET name=?, category=?, price=?, cost=?, unit=?'
    + ' WHERE id=? AND store_id=? AND is_active = 1',
    [data.name, data.category, data.price, data.cost, data.unit, id, storeId]
  );
  if (result.affectedRows === 0) return null;
  return getById(storeId, id);
};

const remove = async (storeId, id) => {
  const [result] = await db.query(
    'UPDATE products SET is_active = 0 WHERE id = ? AND store_id = ? AND is_active = 1', [id, storeId]
  );
  return result.affectedRows > 0;
};

// How many archived rows the list returns at once. Archived items accumulate
// forever (every delete adds one), so the query + payload must stay bounded;
// search narrows beyond the cap. Kept small for a snappy modal + light DOM.
const ARCHIVED_LIMIT = 50;

// Archived (soft-deleted) products, newest-archived first. Mirrors getAll but
// for is_active = 0 — the data layer for the "Archived" view, so deleted items
// stay recoverable instead of being silently re-created as duplicates.
// Returns { rows, hasMore }: we fetch one extra row to tell the client there
// are older archived items beyond the cap (so it can prompt the owner to
// search) without paying for a separate COUNT query.
const getArchived = async (storeId, filters = {}) => {
  let sql = 'SELECT * FROM products WHERE store_id = ? AND is_active = 0';
  const params = [storeId];
  if (filters.search) {
    sql += ' AND LOWER(name) LIKE ?';
    params.push(`%${filters.search.toLowerCase()}%`);
  }
  sql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(ARCHIVED_LIMIT + 1);
  const [rows] = await db.query(sql, params);
  const hasMore = rows.length > ARCHIVED_LIMIT;
  return { rows: hasMore ? rows.slice(0, ARCHIVED_LIMIT) : rows, hasMore };
};

// Look up an archived twin by exact (case-insensitive) name. Used on create to
// catch an owner re-adding a previously deleted item, so we can offer Restore
// (keeps the sale history tied to the original id) instead of spawning a
// duplicate that splits that product's history across two ids. Store-scoped:
// two different stores may legitimately have a product of the same name.
const findArchivedByName = async (storeId, name) => {
  const [rows] = await db.query(
    'SELECT * FROM products WHERE store_id = ? AND is_active = 0 AND LOWER(name) = ?'
    + ' ORDER BY updated_at DESC LIMIT 1',
    [storeId, String(name).trim().toLowerCase()]
  );
  return rows[0] || null;
};

// Un-archive a product. `data` is optional: when the owner restores via the
// re-add flow we refresh name/category/price/cost/unit to what they just typed
// (months-old pricing is usually stale); a bare restore from the Archived list
// brings the item back exactly as it was. Stock is intentionally untouched —
// it stays at its archived value (typically 0) and is replenished on Inventory.
const restore = async (storeId, id, data = null) => {
  let result;
  if (data) {
    [result] = await db.query(
      'UPDATE products SET name=?, category=?, price=?, cost=?, unit=?, is_active=1'
      + ' WHERE id=? AND store_id=? AND is_active=0',
      [data.name, data.category, data.price, data.cost, data.unit, id, storeId]
    );
  } else {
    [result] = await db.query(
      'UPDATE products SET is_active=1 WHERE id=? AND store_id=? AND is_active=0', [id, storeId]
    );
  }
  if (result.affectedRows === 0) return null;
  return getById(storeId, id);
};

const getLowStock = async (storeId, threshold = 50) => {
  // Inclusive threshold (stock <= ?): a product sitting exactly at the threshold
  // counts as low, matching getInventoryCounts/analytics summary and getStockLevels
  // so the count, the alerts list, and the table dots never disagree at the boundary.
  const [rows] = await db.query(
    'SELECT * FROM products'
    + ' WHERE store_id = ? AND is_active = 1 AND stock > 0 AND stock <= ?'
    + ' ORDER BY stock ASC',
    [storeId, threshold]
  );
  return rows;
};

const getOutOfStock = async (storeId) => {
  const [rows] = await db.query(
    'SELECT * FROM products WHERE store_id = ? AND is_active = 1 AND stock = 0',
    [storeId]
  );
  return rows;
};

const getStockLevels = async (storeId, threshold = 50) => {
  const [rows] = await db.query(
    'SELECT id, name, category, stock, unit FROM products'
    + ' WHERE store_id = ? AND is_active = 1 ORDER BY name ASC',
    [storeId]
  );
  return rows.map(p => ({
    ...p,
    // Inclusive (stock <= threshold) so the table dots agree with the summary
    // count and the low-stock alerts list at the exact threshold boundary.
    status: p.stock === 0 ? 'out-of-stock'
           : p.stock <= threshold ? 'low'
           : 'in-stock',
  }));
};

const adjustStock = async (storeId, id, qty, type, notes = null, userId = null, expenseData = null, storeTz = settings.getTimezone()) => {
  const product = await getById(storeId, id);
  if (!product) return null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const stockBefore = product.stock;
    const stockAfter  = Math.max(0, stockBefore + qty);

    await conn.query(
      'UPDATE products SET stock = ? WHERE id = ? AND store_id = ?', [stockAfter, id, storeId]
    );

    const [adjResult] = await conn.query(
      `INSERT INTO inventory_adjustments
         (store_id, product_id, type, qty, stock_before, stock_after, notes, adjusted_by,
          unit_cost, total_paid, payment_method, supplier_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        storeId, id, type, Math.abs(qty), stockBefore, stockAfter, notes, userId,
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
      const storeToday = dateInTz(storeTz);
      const [cmResult] = await conn.query(
        `INSERT INTO cash_movements
           (store_id, type, category, amount, description, occurred_at, source, source_id, recorded_by)
         VALUES (?, 'opex', 'restock', ?, ?, ?, 'restock', ?, ?)`,
        [storeId, expenseData.totalPaid, desc, storeToday, adjResult.insertId, userId]
      );
      cashMovement = { id: cmResult.insertId, type: 'opex', category: 'restock', amount: expenseData.totalPaid };
    }

    await conn.commit();

    const updatedProduct = await getById(storeId, id);
    return { product: updatedProduct, cashMovement };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const getInventoryCounts = async (storeId, threshold = 50) => {
  const [[row]] = await db.query(
    `SELECT
       COUNT(*)                                                   AS totalProducts,
       COALESCE(SUM(stock), 0)                                    AS totalItems,
       SUM(CASE WHEN stock = 0              THEN 1 ELSE 0 END)    AS outOfStockCount,
       SUM(CASE WHEN stock > 0 AND stock <= ? THEN 1 ELSE 0 END)  AS lowStockCount
     FROM products
     WHERE store_id = ? AND is_active = 1`,
    [threshold, storeId]
  );
  return {
    totalProducts:   Number(row.totalProducts),
    totalItems:      Number(row.totalItems),
    outOfStockCount: Number(row.outOfStockCount),
    lowStockCount:   Number(row.lowStockCount),
  };
};

const getAdjustmentLog = async (storeId, productId) => {
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
    WHERE ia.store_id = ?
  `;
  const params = [storeId];
  if (productId !== undefined) {
    sql += ' AND ia.product_id = ?';
    params.push(productId);
  }
  sql += ' ORDER BY ia.created_at DESC';
  const [rows] = await db.query(sql, params);
  return rows;
};

module.exports = {
  getAll, getById, create, update, remove,
  getArchived, findArchivedByName, restore,
  getLowStock, getOutOfStock, getStockLevels,
  getInventoryCounts, adjustStock, getAdjustmentLog,
};
