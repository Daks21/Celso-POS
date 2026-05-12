const saleModel    = require('../models/sale.model');
const productModel = require('../models/product.model');

const LOW_STOCK_THRESHOLD = 50;

const _parseFrom = (str) => {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00.000');
  return isNaN(d.getTime()) ? null : d;
};

const _parseTo = (str) => {
  if (!str) return null;
  const d = new Date(str + 'T23:59:59.999');
  return isNaN(d.getTime()) ? null : d;
};

// GET /api/analytics/summary?date=YYYY-MM-DD
const getSummary = (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

  const { totalRevenue, transactionCount, avgSaleValue } = saleModel.getSummary(dateStr);
  const products        = productModel.getAll();
  const totalProducts   = products.length;
  const lowStockCount   = products.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

  res.status(200).json({
    success: true,
    data: { totalRevenue, transactionCount, avgSaleValue, totalProducts, lowStockCount, outOfStockCount }
  });
};

// GET /api/analytics/heatmap
const getHeatmap = (req, res) => {
  res.status(200).json({ success: true, data: saleModel.getDailyMap() });
};

// GET /api/analytics/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD
const getKPIs = (req, res) => {
  const from = _parseFrom(req.query.from);
  const to   = _parseTo(req.query.to);
  res.status(200).json({ success: true, data: saleModel.getKPIs(from, to) });
};

// GET /api/analytics/charts?from=YYYY-MM-DD&to=YYYY-MM-DD
const getCharts = (req, res) => {
  const from = _parseFrom(req.query.from);
  const to   = _parseTo(req.query.to);

  // Seed a zero entry for every date in the range so the chart has no gaps
  const revenueByDay = {};
  if (from && to) {
    const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(),   to.getMonth(),   to.getDate());
    while (cur <= end) {
      revenueByDay[cur.toISOString().slice(0, 10)] = 0;
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Overlay actual daily totals — only keep dates inside the seeded range
  const fullMap = saleModel.getDailyMap();
  Object.entries(fullMap).forEach(([date, rev]) => {
    if (from && to) {
      if (Object.prototype.hasOwnProperty.call(revenueByDay, date)) revenueByDay[date] = rev;
    } else {
      revenueByDay[date] = rev;
    }
  });

  res.status(200).json({
    success: true,
    data: {
      revenueByDay,
      topByRevenue: saleModel.getTopByRevenue(from, to),
      topByQty:     saleModel.getTopByQty(from, to),
      byDayOfWeek:  saleModel.getByDayOfWeek(from, to)
    }
  });
};

module.exports = { getSummary, getHeatmap, getKPIs, getCharts };
