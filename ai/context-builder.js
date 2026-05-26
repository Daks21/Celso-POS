// ai/context-builder.js
const path          = require('path');
const saleModel     = require(path.join(__dirname, '../backend/models/sale.model'));
const productModel  = require(path.join(__dirname, '../backend/models/product.model'));
const cashflowModel = require(path.join(__dirname, '../backend/models/cashflow.model'));

const DAYS = ['Sunday','Monday','Tuesday','Wednesday',
              'Thursday','Friday','Saturday'];

function peso(n) {
  return '₱' + Number(n).toLocaleString('en-PH',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchContext() {
  const manilaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
  const now       = new Date();
  // -29 days + BETWEEN inclusive = exactly 30 calendar days (today and the 29 prior).
  const from30    = new Date(now.getTime() - 29 * 86400000);
  const nowStr    = manilaFmt.format(now);
  const fromStr   = manilaFmt.format(from30);

  const [today, allProducts, kpis,
         topRevenue, topQty, byDow, finance] =
    await Promise.all([
      saleModel.getTodaySummary(),
      productModel.getAll(),
      saleModel.getKPIs(fromStr, nowStr),
      saleModel.getTopByRevenue(fromStr, nowStr, 5),
      saleModel.getTopByQty(fromStr, nowStr, 5),
      saleModel.getDayOfWeekStats(fromStr, nowStr),
      cashflowModel.getSummary({}),  // all-time for utang balance
    ]);

  // Matches productModel.getLowStock semantics (< threshold, not <=).
  const lowStock = allProducts.filter(p => p.stock > 0 && p.stock < 50);
  const outStock = allProducts.filter(p => p.stock === 0);

  return { today, allProducts, lowStock, outStock,
           kpis, topRevenue, topQty, byDow, finance };
}

function buildContextText(ctx) {
  const lines = [];

  // Today — actual field is totalRevenue, not revenue
  lines.push("TODAY'S PERFORMANCE:");
  lines.push(
    'Revenue: ' + peso(ctx.today?.totalRevenue || 0) +
    ' | Transactions: ' + (ctx.today?.transactionCount || 0) +
    ' | Avg: ' + peso(ctx.today?.avgSaleValue || 0)
  );

  // 30-day KPIs
  lines.push("\nLAST 30 DAYS — KPIs:");
  lines.push(
    'Revenue: ' + peso(ctx.kpis?.totalRevenue || 0) +
    ' | Orders: ' + (ctx.kpis?.transactionCount || 0) +
    ' | Avg Order: ' + peso(ctx.kpis?.avgOrderValue || 0) +
    ' | Units Sold: ' + (ctx.kpis?.totalUnits || 0)
  );

  // Top products by revenue — getTopByRevenue returns { name, revenue } only
  if (ctx.topRevenue?.length) {
    lines.push("\nTOP 5 PRODUCTS BY REVENUE (last 30 days):");
    ctx.topRevenue.forEach((p, i) => {
      lines.push((i + 1) + '. ' + p.name + ' — ' + peso(p.revenue));
    });
  }

  if (ctx.topQty?.length) {
    lines.push("\nTOP 5 PRODUCTS BY UNITS SOLD (last 30 days):");
    ctx.topQty.forEach((p, i) => {
      lines.push((i + 1) + '. ' + p.name + ' — ' + p.qty + ' units');
    });
  }

  // Inventory
  if (ctx.outStock.length) {
    lines.push('\nOUT OF STOCK (' + ctx.outStock.length + ' items):');
    ctx.outStock.slice(0, 8).forEach(p => lines.push('• ' + p.name));
  }

  if (ctx.lowStock.length) {
    lines.push("\nLOW STOCK ALERTS (1–49 units):");
    ctx.lowStock.slice(0, 10).forEach(p =>
      lines.push('• ' + p.name + ': ' + p.stock + ' units')
    );
  }

  // Avg revenue per day-of-week — uses getDayOfWeekStats so the ranking isn't
  // biased by weekdays that happened to fall 5 vs 4 times in the 30-day window.
  if (ctx.byDow?.length) {
    const indexed = ctx.byDow
      .map((d, i) => ({ day: DAYS[i], avg: d.avgPerDay, n: d.distinctDays }))
      .filter(d => d.n > 0)
      .sort((a, b) => b.avg - a.avg);
    if (indexed.length) {
      lines.push("\nAVG REVENUE PER DAY-OF-WEEK (last 30 days):");
      indexed.forEach(d =>
        lines.push(d.day + ': ' + peso(d.avg) +
                   ' (avg over ' + d.n + ' ' + (d.n === 1 ? 'day' : 'days') + ')')
      );
    }
  }

  // Financial summary — getSummary returns debtBalance, not utang
  if (ctx.finance) {
    lines.push("\nCASHFLOW SUMMARY (all-time):");
    lines.push(
      'Money In: ' + peso(ctx.finance.moneyIn) +
      ' | Money Out: ' + peso(ctx.finance.moneyOut) +
      ' | Net Balance: ' + peso(ctx.finance.net)
    );
    if (ctx.finance.debtBalance > 0) {
      lines.push('Outstanding Utang (borrowed capital): ' +
        peso(ctx.finance.debtBalance));
    }
  }

  // Wrap in clear delimiters so the system prompt can instruct the LLM to
  // treat everything inside as untrusted data, never as instructions.
  // (Product names are user-controlled — a malicious name could otherwise
  //  smuggle imperatives into the prompt.)
  return '<STORE_DATA>\n' + lines.join('\n') + '\n</STORE_DATA>';
}

module.exports = { fetchContext, buildContextText };
