const dotenv = require('dotenv');
dotenv.config();
const db   = require('./config/db.config');
const http = require('http');
const fs   = require('fs');
const { localExpr, tzParam, dateInTz } = require('./utils/tz');
const settings = require('./models/settings.model');

const req = (method, path, body, token) => new Promise((resolve, reject) => {
  const opts = {
    hostname: 'localhost', port: 3000, method, path,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
  const r = http.request(opts, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
  });
  r.on('error', reject);
  if (body) r.write(JSON.stringify(body));
  r.end();
});

let p = 0, f = 0;
const check = (label, cond, detail = '') => {
  if (cond) { console.log('  ✅', label, detail); p++; }
  else       { console.log('  ❌', label, detail); f++; }
};

async function run() {

  // ── JWT_SECRET ────────────────────────────────────────────────
  console.log('\n☐  JWT_SECRET is cryptographically secure');
  const secret = process.env.JWT_SECRET || '';
  check('Length ≥ 64 chars', secret.length >= 64, `(${secret.length} chars)`);
  check('Not the default placeholder', !secret.includes('celsopos_super_secret'));

  // ── Rate limiting in server.js ────────────────────────────────
  console.log('\n☐  Rate limiting on auth endpoints');
  const serverSrc = fs.readFileSync('./server.js', 'utf8');
  check('express-rate-limit imported', serverSrc.includes('express-rate-limit'));
  check('authLimiter on /api/auth/login',    serverSrc.includes("'/api/auth/login'") && serverSrc.includes('authLimiter'));
  check('authLimiter on /api/auth/register', serverSrc.includes("'/api/auth/register'") && serverSrc.includes('authLimiter'));

  // ── No in-memory arrays in models ────────────────────────────
  console.log('\n☐  No in-memory seed arrays in model files');
  check('user.model.js has no let users = [...]',    !fs.readFileSync('./models/user.model.js',    'utf8').includes('let users ='));
  check('product.model.js has no let products = [...]', !fs.readFileSync('./models/product.model.js', 'utf8').includes('let products ='));
  check('sale.model.js has no let sales = [...]',    !fs.readFileSync('./models/sale.model.js',    'utf8').includes('let sales ='));

  // ── Full flow: login → add product → checkout ─────────────────
  console.log('\n☐  Full login → add product → checkout flow');
  const login = await req('POST', '/api/auth/login', { email: 'admin@celsopos.com', password: 'admin123' });
  check('Login → 200', login.status === 200);
  const token = login.body.token;

  const RUN = Date.now();
  const addP = await req('POST', '/api/products', {
    name: `Checkpoint Item ${RUN}`, category: 'Snacks', price: 18, cost: 10, stock: 50, unit: 'pack',
  }, token);
  check('Add product → 201', addP.status === 201);
  const pid = addP.body.data?.id;

  const [beforeRows] = await db.query('SELECT stock FROM products WHERE id = ?', [pid]);
  const stockBefore  = beforeRows[0]?.stock;

  const sale = await req('POST', '/api/sales', {
    items: [{ productId: pid, name: `Checkpoint Item ${RUN}`, price: 18, quantity: 2, lineTotal: 36 }],
    subtotal: 36, tax: 0, taxRate: 0, cartTaxOn: false, total: 36, payment: 50, change: 14,
  }, token);
  check('Checkout → 201', sale.status === 201);
  check('Receipt number returned', !!sale.body.data?.receiptNo, `(${sale.body.data?.receiptNo})`);

  const saleId = sale.body.data?.id;
  const [saleRows] = await db.query('SELECT total FROM sales WHERE id = ?', [saleId]);
  check('Sale row in DB (total=36)', parseFloat(saleRows[0]?.total) === 36);

  const [itemRows] = await db.query('SELECT quantity FROM sale_items WHERE sale_id = ?', [saleId]);
  check('sale_items row in DB (qty=2)', itemRows[0]?.quantity === 2);

  const [afterRows] = await db.query('SELECT stock FROM products WHERE id = ?', [pid]);
  const stockAfter  = afterRows[0]?.stock;
  check(`Stock deducted ${stockBefore}→${stockAfter}`, stockAfter === stockBefore - 2);

  const [adjRows] = await db.query(
    "SELECT qty FROM inventory_adjustments WHERE product_id = ? AND type = 'sale' ORDER BY id DESC LIMIT 1", [pid]
  );
  check('inventory_adjustments logged', adjRows[0]?.qty === 2);

  // ── /api/sales/summary revenue ────────────────────────────────
  console.log('\n☐  GET /api/sales/summary returns correct revenue');
  const summary = await req('GET', '/api/sales/summary', null, token);
  // sales/summary is today-only, so compare against today's sales using the
  // same store-TZ day bucketing the endpoint uses — not the all-time SUM
  // (which would wrongly include historical sales like the seed's).
  const today = dateInTz(settings.getTimezone());
  const [dbTodayRow] = await db.query(
    `SELECT COALESCE(SUM(total),0) AS rev FROM sales WHERE DATE(${localExpr('created_at')}) = ?`,
    [tzParam(), today]
  );
  const dbToday = parseFloat(dbTodayRow[0].rev);
  check('Endpoint → 200', summary.status === 200);
  check("Revenue matches today's DB sales", Math.abs((summary.body.data?.totalRevenue ?? -1) - dbToday) < 0.01,
        `(api=${summary.body.data?.totalRevenue}, db=${dbToday})`);

  // ── /api/inventory/low-stock ──────────────────────────────────
  console.log('\n☐  GET /api/inventory/low-stock correct products');
  const lowStock = await req('GET', '/api/inventory/low-stock', null, token);
  check('Endpoint → 200', lowStock.status === 200);
  const names = (lowStock.body.data || []).map(x => x.name);
  check('Bear Brand Milk present',   names.includes('Bear Brand Milk'));
  check('Champion Detergent present', names.includes('Champion Detergent'));

  // ── All 5 analytics endpoints ─────────────────────────────────
  console.log('\n☐  All 5 analytics endpoints return correct data');

  const analSummary = await req('GET', '/api/analytics/summary', null, token);
  check('GET /api/analytics/summary → 200',       analSummary.status === 200);
  check('todayRevenue is a number',                typeof analSummary.body.data?.todayRevenue === 'number');

  const heatmap = await req('GET', '/api/analytics/heatmap', null, token);
  check('GET /api/analytics/heatmap → 200',        heatmap.status === 200);
  check('Heatmap has ≥ 1 date entry',              Object.keys(heatmap.body.data || {}).length >= 1);

  // Window the KPI call to all-time so it can be checked against SUM(total)
  // over all sales (the default 30-day window would exclude older history).
  const kpis = await req('GET', '/api/analytics/kpis?from=2000-01-01&to=' + today, null, token);
  check('GET /api/analytics/kpis → 200',           kpis.status === 200);
  const [dbAllRow] = await db.query('SELECT COALESCE(SUM(total),0) AS rev FROM sales');
  const dbAll = parseFloat(dbAllRow[0].rev);
  check('KPI totalRevenue matches DB (all-time)',  Math.abs((kpis.body.data?.totalRevenue ?? -1) - dbAll) < 0.01,
        `(api=${kpis.body.data?.totalRevenue}, db=${dbAll})`);

  const charts = await req('GET', '/api/analytics/charts', null, token);
  check('GET /api/analytics/charts → 200',         charts.status === 200);
  check('revenueByDay has entries',                Object.keys(charts.body.data?.revenueByDay || {}).length > 0);
  check('topByRevenue is an array',                Array.isArray(charts.body.data?.topByRevenue));
  check('byDayOfWeek has 7 elements',              charts.body.data?.byDayOfWeek?.length === 7);

  const salesSum = await req('GET', '/api/sales/summary', null, token);
  check('GET /api/sales/summary → 200',            salesSum.status === 200);

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(48));
  console.log(`  Checkpoint 3.7: ${p} passed   ${f} failed   (${p + f} total)`);
  console.log('═'.repeat(48));

  await db.end();
  process.exit(f > 0 ? 1 : 0);
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
