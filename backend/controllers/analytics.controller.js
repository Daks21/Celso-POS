const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

// ── Helpers ───────────────────────────────────────────────────────────────
// Manila timezone date formatter — keep all dates user-local so YYYY-MM-DD
// keys line up with sale rows and frontend display alike.
const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });

// Returns the immediately-prior same-length window given a [from, to] pair.
// Both inputs and outputs are YYYY-MM-DD strings. The prior window ends the
// day before `from` and spans the same number of days.
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

const getSummary = async (req, res, next) => {
  try {
    const dateStr   = req.query.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const threshold = parseInt(req.query.threshold, 10) || 50;

    const [saleSummary, products] = await Promise.all([
      saleModel.getSummary(dateStr),
      productModel.getAll(),
    ]);

    const { totalRevenue, transactionCount, avgSaleValue } = saleSummary;
    const totalProducts   = products.length;
    const lowStockItems   = products.filter(p => p.stock > 0 && p.stock <= threshold);
    const outOfStockItems = products.filter(p => p.stock === 0);

    res.status(200).json({
      success: true,
      data: {
        todayRevenue:      totalRevenue,
        todayTransactions: transactionCount,
        avgSaleValue,
        totalProducts,
        lowStockCount:     lowStockItems.length,
        outOfStockCount:   outOfStockItems.length,
        lowStockItems:     [...outOfStockItems, ...lowStockItems],
      }
    });
  } catch (err) {
    next(err);
  }
};

const getHeatmap = async (req, res, next) => {
  try {
    const data = await saleModel.getDailyMap();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getKPIs = async (req, res, next) => {
  try {
    const from = req.query.from || manilaFmt.format(new Date(Date.now() - 30 * 86400000));
    const to   = req.query.to   || manilaFmt.format(new Date());

    const prev = priorWindow(from, to);
    const [current, previous] = await Promise.all([
      saleModel.getKPIs(from, to),
      saleModel.getKPIs(prev.from, prev.to),
    ]);

    // Keep current keys at the top level for backward compatibility,
    // expose the prior-period snapshot under `previous`.
    res.json({
      success: true,
      data: {
        ...current,
        previous,
        previousRange: prev,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Profit ────────────────────────────────────────────────────────────────
// Realized gross profit for the period:
//   gross profit = SUM(line_total) − SUM(quantity × products.cost)
// Compared against the immediately-prior same-length window.
const getProfit = async (req, res, next) => {
  try {
    const from = req.query.from || manilaFmt.format(new Date(Date.now() - 30 * 86400000));
    const to   = req.query.to   || manilaFmt.format(new Date());

    const prev = priorWindow(from, to);
    const [current, previous, byProduct] = await Promise.all([
      saleModel.getProfit(from, to),
      saleModel.getProfit(prev.from, prev.to),
      saleModel.getProfitByProduct(from, to),
    ]);

    res.json({
      success: true,
      data: { ...current, previous, byProduct, previousRange: prev },
    });
  } catch (err) {
    next(err);
  }
};

// ── Inventory Health ──────────────────────────────────────────────────────
// 90-day movement view across the catalog. Buckets:
//   - slowMovers:   active, in-stock, ≤ 1 unit/week velocity
//   - deadStock:    in-stock products with ZERO movement in the window
//   - turnover:     days-of-stock remaining at current sell rate (high → low)
const getInventoryHealth = async (req, res, next) => {
  try {
    const today  = manilaFmt.format(new Date());
    const since  = manilaFmt.format(new Date(Date.now() - 90 * 86400000));
    const data   = await saleModel.getInventoryHealth(since, today);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getCharts = async (req, res, next) => {
  try {
    const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
    const from = req.query.from || manilaFmt.format(new Date(Date.now() - 30 * 86400000));
    const to   = req.query.to   || manilaFmt.format(new Date());

    // Seed zero for every date in range so the chart has no gaps.
    // Iterate as date strings to stay in local (Manila) time — avoids UTC key mismatch.
    const revenueByDay = {};
    let curStr = from;
    while (curStr <= to) {
      revenueByDay[curStr] = 0;
      // advance by one day using noon-UTC trick to dodge DST
      const next = new Date(curStr + 'T12:00:00Z');
      next.setUTCDate(next.getUTCDate() + 1);
      curStr = next.toISOString().slice(0, 10);
    }

    const [dailyMap, topByRevenue, topByQty, byDayOfWeek] = await Promise.all([
      saleModel.getDailyMap(),
      saleModel.getTopByRevenue(from, to),
      saleModel.getTopByQty(from, to),
      saleModel.getByDayOfWeek(from, to),
    ]);

    Object.entries(dailyMap).forEach(([date, rev]) => {
      if (Object.prototype.hasOwnProperty.call(revenueByDay, date)) revenueByDay[date] = rev;
    });

    res.status(200).json({
      success: true,
      data: { revenueByDay, topByRevenue, topByQty, byDayOfWeek },
    });
  } catch (err) {
    next(err);
  }
};

// ── Goal Projection ───────────────────────────────────────────────────────
// One-stop endpoint for the Monthly Revenue Goal card. Returns
// month-to-date + the inputs needed to draw an honest end-of-month
// projection — without forcing the frontend to make a second /kpis call
// for the calendar month, and without leaving projection math on the
// client where it was previously naive.
const getGoalProjection = async (req, res, next) => {
  try {
    const today = manilaFmt.format(new Date());

    const { currentMonthRevenue, trailingDailyAvg, daysOfHistory } =
      await saleModel.getGoalProjectionInputs(today);

    // Days remaining in the current calendar month (inclusive of today).
    const now      = new Date();
    const daysInMo = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const todayDay = parseInt(today.slice(8, 10), 10);
    const daysRemaining = Math.max(0, daysInMo - todayDay);

    // Projected end-of-month = MTD + (avg daily × remaining days).
    const projection = currentMonthRevenue + trailingDailyAvg * daysRemaining;

    res.json({
      success: true,
      data: {
        currentMonth: {
          from:    today.slice(0, 7) + '-01',
          to:      today,
          revenue: currentMonthRevenue,
        },
        trailingDailyAvg,
        daysOfHistory,
        daysRemaining,
        daysInMonth: daysInMo,
        projection,
        // Frontend treats <14 days of history as "limited" — caveat the
        // projection rather than presenting a confident number.
        limitedData: daysOfHistory < 14,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSummary, getHeatmap, getKPIs, getCharts,
  getProfit, getInventoryHealth, getGoalProjection,
};
