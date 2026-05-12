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

module.exports = { create, getAll, getById, getTodaySummary };
