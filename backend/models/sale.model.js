const db = require('../config/db.config');
const settings = require('./settings.model');
const { localExpr, tzParam, dateInTz } = require('../utils/tz');

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
    id:        i.id,
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

  const tzp = tzParam();
  if (filters.from) { conds.push(`DATE(${localExpr('s.created_at')}) >= ?`); params.push(tzp, filters.from); }
  if (filters.to)   { conds.push(`DATE(${localExpr('s.created_at')}) <= ?`); params.push(tzp, filters.to); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY s.created_at DESC';
  if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }

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

    // Step 3: Record sale revenue in cash_movements (atomic with the sale).
    // occurred_at is the store-local calendar day of the sale (created_at is
    // stored UTC), so it matches what the History page shows in store time.
    const occurredAt = dateInTz(settings.getTimezone());
    await connection.query(
      `INSERT INTO cash_movements
         (type, category, amount, description, occurred_at, source, source_id, recorded_by)
       VALUES ('sales_revenue', NULL, ?, ?, ?, 'sale', ?, ?)`,
      [saleRecord.total, `Sale ${receiptNo}`, occurredAt, saleId, userId]
    );

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
  const today = dateInTz(settings.getTimezone());
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(total), 0) AS totalRevenue,
       COUNT(*)                AS transactionCount,
       COALESCE(AVG(total), 0) AS avgSaleValue
     FROM sales WHERE DATE(${localExpr('created_at')}) = ?`,
    [tzParam(), today]
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
     FROM sales WHERE DATE(${localExpr('created_at')}) = ?`,
    [tzParam(), dateStr]
  );
  return {
    totalRevenue:     parseFloat(rows[0].totalRevenue),
    transactionCount: rows[0].transactionCount,
    avgSaleValue:     parseFloat(rows[0].avgSaleValue),
  };
};

const getDailyMap = async () => {
  const tzp = tzParam();
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(${localExpr('created_at')}, '%Y-%m-%d') AS saleDate, SUM(total) AS totalRevenue
     FROM sales GROUP BY DATE_FORMAT(${localExpr('created_at')}, '%Y-%m-%d') ORDER BY saleDate ASC`,
    [tzp, tzp]
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
       WHERE DATE(${localExpr('s.created_at')}) BETWEEN ? AND ?
       GROUP BY s.id, s.total
     ) sub`, [tzParam(), from, to]
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
     WHERE DATE(${localExpr('s.created_at')}) BETWEEN ? AND ?
     GROUP BY si.product_name ORDER BY revenue DESC LIMIT ?`, [tzParam(), from, to, limit]
  );
  return rows.map(r => ({ name: r.name, revenue: parseFloat(r.revenue) }));
};

const getTopByQty = async (from, to, limit = 5) => {
  const [rows] = await db.query(
    `SELECT si.product_name AS name, SUM(si.quantity) AS qty
     FROM sale_items si
     INNER JOIN sales s ON si.sale_id = s.id
     WHERE DATE(${localExpr('s.created_at')}) BETWEEN ? AND ?
     GROUP BY si.product_name
     ORDER BY qty DESC
     LIMIT ?`, [tzParam(), from, to, limit]
  );
  return rows.map(r => ({ name: r.name, qty: parseInt(r.qty, 10) }));
};

const getByDayOfWeek = async (from, to) => {
  const tzp = tzParam();
  const [rows] = await db.query(
    `SELECT (DAYOFWEEK(${localExpr('created_at')}) - 1) AS dayIndex, SUM(total) AS total
     FROM sales WHERE DATE(${localExpr('created_at')}) BETWEEN ? AND ?
     GROUP BY (DAYOFWEEK(${localExpr('created_at')}) - 1) ORDER BY dayIndex ASC`,
    [tzp, tzp, from, to, tzp]
  );
  const totals = [0, 0, 0, 0, 0, 0, 0];
  rows.forEach(r => { totals[r.dayIndex] = parseFloat(r.total); });
  return totals;
};

// ─── Realized profit (revenue − COGS) ─────────────────────────────────────
// Pulls cost from the products table (current cost — snapshot would require a
// schema change, and for MSME analytics today's cost is the closest signal we
// have to the original purchase cost).

const getProfit = async (from, to) => {
  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(si.line_total),                      0) AS revenue,
       COALESCE(SUM(si.quantity * COALESCE(p.cost, 0)),  0) AS cogs
     FROM sale_items si
     INNER JOIN sales    s ON si.sale_id    = s.id
     LEFT  JOIN products p ON si.product_id = p.id
     WHERE DATE(${localExpr('s.created_at')}) BETWEEN ? AND ?`,
    [tzParam(), from, to]
  );
  const revenue = parseFloat(rows[0].revenue);
  const cogs    = parseFloat(rows[0].cogs);
  const profit  = revenue - cogs;
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
  return {
    revenue,
    cogs,
    grossProfit: profit,
    margin: parseFloat(margin.toFixed(2)),
  };
};

const getProfitByProduct = async (from, to, limit = 10) => {
  const [rows] = await db.query(
    `SELECT
       si.product_name                                     AS name,
       SUM(si.line_total)                                  AS revenue,
       SUM(si.quantity * COALESCE(p.cost, 0))              AS cogs,
       SUM(si.quantity)                                    AS units
     FROM sale_items si
     INNER JOIN sales    s ON si.sale_id    = s.id
     LEFT  JOIN products p ON si.product_id = p.id
     WHERE DATE(${localExpr('s.created_at')}) BETWEEN ? AND ?
     GROUP BY si.product_name
     ORDER BY (SUM(si.line_total) - SUM(si.quantity * COALESCE(p.cost, 0))) DESC
     LIMIT ?`,
    [tzParam(), from, to, limit]
  );
  return rows.map(r => {
    const revenue = parseFloat(r.revenue);
    const cogs    = parseFloat(r.cogs);
    const profit  = revenue - cogs;
    return {
      name:    r.name,
      revenue,
      cogs,
      profit,
      units:   parseInt(r.units, 10),
      margin:  revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : 0,
    };
  });
};

// ─── Inventory health (last N days movement vs current stock) ─────────────

const getInventoryHealth = async (from, to) => {
  // Per-product unit velocity over the window
  const [rows] = await db.query(
    `SELECT
       p.id,
       p.name,
       p.stock,
       p.unit,
       p.category,
       p.price,
       p.cost,
       COALESCE(SUM(si.quantity), 0) AS units_sold
     FROM products p
     LEFT JOIN sale_items si
            ON si.product_id = p.id
     LEFT JOIN sales s
            ON s.id = si.sale_id
           AND DATE(${localExpr('s.created_at')}) BETWEEN ? AND ?
     WHERE p.is_active = 1
     GROUP BY p.id, p.name, p.stock, p.unit, p.category, p.price, p.cost`,
    [tzParam(), from, to]
  );

  const windowDays = Math.max(1,
    Math.round(
      (new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400000
    ) + 1
  );

  const enriched = rows.map(r => {
    const sold        = parseInt(r.units_sold, 10) || 0;
    const stock       = parseInt(r.stock, 10) || 0;
    const dailyRate   = sold / windowDays;
    const weeklyRate  = dailyRate * 7;
    // null = stock present but no movement (effectively "infinite" days)
    const daysOfStock = dailyRate > 0 ? Math.round(stock / dailyRate) : null;
    return {
      id:          r.id,
      name:        r.name,
      stock,
      unit:        r.unit,
      category:    r.category,
      price:       parseFloat(r.price) || 0,
      cost:        parseFloat(r.cost)  || 0,
      unitsSold:   sold,
      dailyRate:   parseFloat(dailyRate.toFixed(3)),
      weeklyRate:  parseFloat(weeklyRate.toFixed(2)),
      daysOfStock,
      tiedUpCapital: stock * (parseFloat(r.cost) || 0),
    };
  });

  const deadStock = enriched
    .filter(p => p.stock > 0 && p.unitsSold === 0)
    .sort((a, b) => b.tiedUpCapital - a.tiedUpCapital);

  const slowMovers = enriched
    .filter(p => p.stock > 0 && p.unitsSold > 0 && p.weeklyRate <= 1)
    .sort((a, b) => a.weeklyRate - b.weeklyRate);

  const turnover = enriched
    .filter(p => p.stock > 0 && p.daysOfStock !== null)
    .sort((a, b) => b.daysOfStock - a.daysOfStock);

  const fastMovers = enriched
    .filter(p => p.weeklyRate >= 5)
    .sort((a, b) => b.weeklyRate - a.weeklyRate)
    .slice(0, 10);

  return {
    windowDays,
    deadStock:   deadStock.slice(0, 20),
    slowMovers:  slowMovers.slice(0, 20),
    turnover:    turnover.slice(0, 20),
    fastMovers,
  };
};

// ─── Goal projection ──────────────────────────────────────────────────────
// Provides the inputs the frontend needs to draw an honest end-of-month
// projection on the Monthly Revenue Goal card:
//   - currentMonthRevenue : Calendar month-to-date revenue (store-local).
//   - trailingDailyAvg    : Avg daily revenue over the LAST 30 DAYS as of
//                           today. Acts as the per-day baseline for the
//                           days still remaining in the month — far more
//                           robust than `revenue / dayOfMonth × daysInMo`.
//   - daysOfHistory       : Distinct sales-day count in that 30-day window.
//                           Frontend uses this to caveat "limited data"
//                           when the store is brand new.
const getGoalProjectionInputs = async (storeToday) => {
  // Calendar month-to-date revenue.
  const firstOfMonth = storeToday.slice(0, 7) + '-01';
  const [[mtdRow]] = await db.query(
    `SELECT COALESCE(SUM(total), 0) AS revenue
     FROM sales
     WHERE DATE(${localExpr('created_at')}) BETWEEN ? AND ?`,
    [tzParam(), firstOfMonth, storeToday]
  );

  // Trailing 30-day daily average. Window ends YESTERDAY (today is partial
  // and would skew the baseline downwards in the morning, upwards in the
  // evening). If the store is younger than 30 days, the SUM/COUNT just
  // reflects what data we have — the daysOfHistory field tells the
  // frontend how confident to be.
  const tzp = tzParam();
  const [[trailRow]] = await db.query(
    `SELECT
       COALESCE(SUM(total), 0) AS revenue,
       COUNT(DISTINCT DATE(${localExpr('created_at')})) AS days_with_sales
     FROM sales
     WHERE DATE(${localExpr('created_at')}) >= DATE_SUB(?, INTERVAL 30 DAY)
       AND DATE(${localExpr('created_at')}) <  ?`,
    [tzp, tzp, storeToday, tzp, storeToday]
  );
  const trailingSum     = parseFloat(trailRow.revenue) || 0;
  const daysOfHistory   = parseInt(trailRow.days_with_sales, 10) || 0;
  // Divide by 30 (the window length), NOT by days_with_sales — closed days
  // are still part of the rhythm. A store closed Sundays should project
  // weeks that include Sundays.
  const trailingDailyAvg = trailingSum / 30;

  return {
    currentMonthRevenue: parseFloat(mtdRow.revenue) || 0,
    trailingDailyAvg,
    daysOfHistory,
  };
};

// ─── Edit (full reconciliation transaction) ────────────────────────────────
// Corrects a past sale and keeps every dependent record in sync, atomically:
//   • per-line stock is returned or deducted by the quantity delta
//   • an inventory_adjustments audit row is written for each changed product
//   • the sales header (subtotal/tax/total/payment/change) is recomputed
//   • the linked sales_revenue cash_movement is re-amounted so Finance stays right
// Trust boundary: only the new per-line quantities, the tax on/off toggle, and
// the payment are taken from the client. Unit prices come from the ORIGINAL
// sale_items snapshot (never re-priced to today's product price) and the tax
// rate is the sale's own stored rate — so totals can't be tampered with or
// silently re-priced. Removing a line = quantity 0. At least one line must remain
// (clearing a whole sale is a void, which is a separate flow).
const update = async (saleId, edits, userId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [saleRows] = await connection.query(
      'SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId]
    );
    if (!saleRows[0]) {
      const e = new Error('Sale not found'); e.status = 404; throw e;
    }
    const sale = saleRows[0];
    const receiptNo = sale.receipt_no || `RCPT-${String(saleId).padStart(6, '0')}`;

    const [itemRows] = await connection.query(
      'SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC', [saleId]
    );

    // Requested quantity per existing sale_item id (lines not sent keep their qty)
    const wanted = {};
    (Array.isArray(edits.items) ? edits.items : []).forEach(it => {
      wanted[Number(it.itemId)] = Number(it.quantity);
    });

    let remaining = 0;
    for (const row of itemRows) {
      const q = Object.prototype.hasOwnProperty.call(wanted, row.id) ? wanted[row.id] : row.quantity;
      if (!Number.isInteger(q) || q < 0) {
        const e = new Error('Each quantity must be a whole number (0 or more)'); e.status = 400; throw e;
      }
      row._newQty = q;
      if (q > 0) remaining += 1;
    }
    if (remaining === 0) {
      const e = new Error('A sale must keep at least one item. To cancel it entirely, void the sale instead.');
      e.status = 400; throw e;
    }

    let subtotal = 0;
    for (const row of itemRows) {
      const oldQty = row.quantity;
      const newQty = row._newQty;
      const unitPrice = parseFloat(row.unit_price); // historical snapshot — never re-priced
      const delta = newQty - oldQty;                // >0 deduct more, <0 return stock

      if (delta !== 0) {
        const [stockRows] = await connection.query(
          'SELECT stock FROM products WHERE id = ?', [row.product_id]
        );
        // Product may be soft-deleted; the row (and its stock) still exists.
        if (stockRows[0]) {
          const stockBefore = stockRows[0].stock;
          const stockAfter  = stockBefore - delta;
          if (stockAfter < 0) {
            const e = new Error(`Not enough stock for ${row.product_name} to make this change`);
            e.status = 400; throw e;
          }
          await connection.query(
            'UPDATE products SET stock = ? WHERE id = ?', [stockAfter, row.product_id]
          );
          await connection.query(
            `INSERT INTO inventory_adjustments
               (product_id, type, qty, stock_before, stock_after, notes, adjusted_by)
             VALUES (?, 'adjustment', ?, ?, ?, ?, ?)`,
            [row.product_id, Math.abs(delta), stockBefore, stockAfter, `Sale edit ${receiptNo}`, userId]
          );
        }
      }

      if (newQty === 0) {
        await connection.query('DELETE FROM sale_items WHERE id = ?', [row.id]);
      } else {
        const lineTotal = parseFloat((unitPrice * newQty).toFixed(2));
        subtotal += lineTotal;
        if (newQty !== oldQty) {
          await connection.query(
            'UPDATE sale_items SET quantity = ?, line_total = ? WHERE id = ?',
            [newQty, lineTotal, row.id]
          );
        }
      }
    }
    subtotal = parseFloat(subtotal.toFixed(2));

    // Tax uses the sale's own stored rate; the client may only toggle it on/off.
    const taxRate   = sale.tax_rate != null ? parseFloat(sale.tax_rate) : 0;
    const cartTaxOn = Boolean(edits.cartTaxOn) && taxRate > 0;
    const tax       = cartTaxOn ? parseFloat((subtotal * taxRate).toFixed(2)) : 0;
    const total     = parseFloat((subtotal + tax).toFixed(2));

    const payment = Number(edits.payment);
    if (isNaN(payment) || payment < total) {
      const e = new Error('Payment cannot be less than the new total'); e.status = 400; throw e;
    }
    const change = parseFloat((payment - total).toFixed(2));

    await connection.query(
      `UPDATE sales SET subtotal = ?, tax = ?, cart_tax_on = ?, total = ?, payment = ?, change_given = ?
       WHERE id = ?`,
      [subtotal, tax, cartTaxOn ? 1 : 0, total, payment, change, saleId]
    );

    // Keep Finance "Money In" in sync with the corrected revenue (no-op for any
    // legacy sale that predates the cash_movements link).
    await connection.query(
      `UPDATE cash_movements SET amount = ?
       WHERE source = 'sale' AND source_id = ? AND type = 'sales_revenue' AND is_active = 1`,
      [total, saleId]
    );

    await connection.commit();
    connection.release();
    return getById(saleId);
  } catch (err) {
    await connection.rollback();
    connection.release();
    throw err;
  }
};

module.exports = {
  create, update, getAll, getById, getTodaySummary,
  getSummary, getDailyMap, getKPIs,
  getTopByRevenue, getTopByQty, getByDayOfWeek,
  getProfit, getProfitByProduct, getInventoryHealth,
  getGoalProjectionInputs,
};
