const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

const LOW_STOCK_THRESHOLD = 50;

// GET /api/analytics/summary?date=YYYY-MM-DD
const getSummary = async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

    const [saleSummary, products] = await Promise.all([
      saleModel.getSummary(dateStr),
      productModel.getAll(),
    ]);

    const { totalRevenue, transactionCount, avgSaleValue } = saleSummary;
    const totalProducts   = products.length;
    const lowStockItems   = products.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD);
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
        lowStockItems:     [...lowStockItems, ...outOfStockItems],
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/analytics/heatmap
const getHeatmap = async (req, res) => {
  try {
    const data = await saleModel.getDailyMap();
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/analytics/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD
const getKPIs = async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const toDate   = to   ? new Date(to)   : new Date();
    const kpis = await saleModel.getKPIs(fromDate, toDate);
    res.json({ success: true, data: kpis });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/analytics/charts?from=YYYY-MM-DD&to=YYYY-MM-DD
const getCharts = async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from + 'T00:00:00.000') : new Date(Date.now() - 30 * 86400000);
    const toDate   = to   ? new Date(to   + 'T23:59:59.999') : new Date();

    // Seed zero for every date in range so the chart has no gaps
    const revenueByDay = {};
    const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const end = new Date(toDate.getFullYear(),   toDate.getMonth(),   toDate.getDate());
    while (cur <= end) {
      revenueByDay[cur.toISOString().slice(0, 10)] = 0;
      cur.setDate(cur.getDate() + 1);
    }

    const [dailyMap, topByRevenue, topByQty, byDayOfWeek] = await Promise.all([
      saleModel.getDailyMap(),
      saleModel.getTopByRevenue(fromDate, toDate),
      saleModel.getTopByQty(fromDate, toDate),
      saleModel.getByDayOfWeek(fromDate, toDate),
    ]);

    Object.entries(dailyMap).forEach(([date, rev]) => {
      if (Object.prototype.hasOwnProperty.call(revenueByDay, date)) revenueByDay[date] = rev;
    });

    res.status(200).json({
      success: true,
      data: { revenueByDay, topByRevenue, topByQty, byDayOfWeek },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getSummary, getHeatmap, getKPIs, getCharts };
