const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

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
    const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
    const from = req.query.from || manilaFmt.format(new Date(Date.now() - 30 * 86400000));
    const to   = req.query.to   || manilaFmt.format(new Date());
    const kpis = await saleModel.getKPIs(from, to);
    res.json({ success: true, data: kpis });
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

module.exports = { getSummary, getHeatmap, getKPIs, getCharts };
