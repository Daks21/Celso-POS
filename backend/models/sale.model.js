let sales = [];

const create = (saleData) => {
  const sale = { id: Date.now(), ...saleData };
  sales.push(sale);
  return sale;
};

const getAll = (filters = {}) => {
  let result = sales.slice();

  if (filters.from) {
    const from = new Date(filters.from);
    from.setHours(0, 0, 0, 0);
    result = result.filter(s => new Date(s.timestamp) >= from);
  }

  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    result = result.filter(s => new Date(s.timestamp) <= to);
  }

  return result;
};

const getById = (id) => {
  return sales.find(s => s.id === id) || null;
};

const getTodaySummary = () => {
  const now = new Date();
  const todaySales = sales.filter(s => {
    const d = new Date(s.timestamp);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth()    === now.getMonth()    &&
      d.getDate()     === now.getDate()
    );
  });

  const totalRevenue     = todaySales.reduce((sum, s) => sum + s.total, 0);
  const transactionCount = todaySales.length;
  const avgSaleValue     = transactionCount > 0 ? totalRevenue / transactionCount : 0;

  return { totalRevenue, transactionCount, avgSaleValue };
};

// Returns sales within [from, to] inclusive. Both are Date objects or null.
const _inRange = (from, to) => {
  return sales.filter(s => {
    const d = new Date(s.timestamp);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
};

// { totalRevenue, transactionCount, avgSaleValue } for a single calendar date (YYYY-MM-DD string)
const getSummary = (dateStr) => {
  const from = new Date(dateStr + 'T00:00:00.000');
  const to   = new Date(dateStr + 'T23:59:59.999');
  const subset = _inRange(from, to);

  const totalRevenue     = subset.reduce((sum, s) => sum + s.total, 0);
  const transactionCount = subset.length;
  const avgSaleValue     = transactionCount > 0 ? totalRevenue / transactionCount : 0;

  return { totalRevenue, transactionCount, avgSaleValue };
};

// { 'YYYY-MM-DD': totalRevenue } for every day that has sales (full history, no filter)
const getDailyMap = () => {
  const map = {};
  sales.forEach(s => {
    const key = new Date(s.timestamp).toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + s.total;
  });
  return map;
};

// { totalRevenue, transactionCount, avgOrderValue, totalUnits } for a date range
const getKPIs = (from, to) => {
  const subset = _inRange(from, to);

  const totalRevenue     = subset.reduce((sum, s) => sum + s.total, 0);
  const transactionCount = subset.length;
  const avgOrderValue    = transactionCount > 0 ? totalRevenue / transactionCount : 0;
  const totalUnits       = subset.reduce((sum, s) =>
    sum + s.items.reduce((si, item) => si + item.quantity, 0), 0);

  return { totalRevenue, transactionCount, avgOrderValue, totalUnits };
};

// Top N products by revenue: [{ name, revenue }]
const getTopByRevenue = (from, to, limit = 5) => {
  const subset = _inRange(from, to);
  const map = {};
  subset.forEach(s => {
    s.items.forEach(item => {
      map[item.name] = (map[item.name] || 0) + item.lineTotal;
    });
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, revenue]) => ({ name, revenue }));
};

// Top N products by units sold: [{ name, qty }]
const getTopByQty = (from, to, limit = 5) => {
  const subset = _inRange(from, to);
  const map = {};
  subset.forEach(s => {
    s.items.forEach(item => {
      map[item.name] = (map[item.name] || 0) + item.quantity;
    });
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }));
};

// 7-element array of revenue totals indexed by day of week (0=Sun … 6=Sat)
const getByDayOfWeek = (from, to) => {
  const subset = _inRange(from, to);
  const totals = [0, 0, 0, 0, 0, 0, 0];
  subset.forEach(s => {
    totals[new Date(s.timestamp).getDay()] += s.total;
  });
  return totals;
};

module.exports = {
  create, getAll, getById, getTodaySummary,
  getSummary, getDailyMap, getKPIs,
  getTopByRevenue, getTopByQty, getByDayOfWeek
};
