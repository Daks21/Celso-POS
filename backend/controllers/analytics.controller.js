const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');
const settings     = require('../models/settings.model');
const { dateInTz } = require('../utils/tz');

// ── Helpers ───────────────────────────────────────────────────────────────
// Store-local date helpers — keep all default date ranges in the store
// timezone so YYYY-MM-DD keys line up with sale buckets and frontend display.
const storeToday    = () => dateInTz(settings.getTimezone());
const storeDaysAgo  = (n) => dateInTz(settings.getTimezone(), new Date(Date.now() - n * 86400000));

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
    const dateStr   = req.query.date || storeToday();
    // A threshold of 0 is valid ("only flag truly out-of-stock"); don't let a
    // falsy `|| 50` swallow it. Fall back to 50 only when absent/invalid.
    const parsedThreshold = parseInt(req.query.threshold, 10);
    const threshold = Number.isFinite(parsedThreshold) && parsedThreshold >= 0
      ? parsedThreshold
      : 50;

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
    const from = req.query.from || storeDaysAgo(30);
    const to   = req.query.to   || storeToday();

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
    const from = req.query.from || storeDaysAgo(30);
    const to   = req.query.to   || storeToday();

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
    const today  = storeToday();
    const since  = storeDaysAgo(90);
    const data   = await saleModel.getInventoryHealth(since, today);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getCharts = async (req, res, next) => {
  try {
    const from = req.query.from || storeDaysAgo(30);
    const to   = req.query.to   || storeToday();

    // Seed zero for every date in range so the chart has no gaps.
    // Iterate as date strings to stay in store-local time — avoids UTC key mismatch.
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
    const today = storeToday();

    const { currentMonthRevenue, trailingDailyAvg, daysOfHistory } =
      await saleModel.getGoalProjectionInputs(today);

    // Days remaining in the current calendar month (inclusive of today).
    // Derive year/month from the store-local date so the month boundary
    // doesn't depend on the server's own timezone.
    const year     = parseInt(today.slice(0, 4), 10);
    const month    = parseInt(today.slice(5, 7), 10);   // 1–12
    const daysInMo = new Date(year, month, 0).getDate(); // day 0 of next month
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
