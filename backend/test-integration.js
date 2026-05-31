const dotenv = require('dotenv');
dotenv.config();
const db  = require('./config/db.config');
const http = require('http');
const { localExpr, tzParam, dateInTz } = require('./utils/tz');
const settings = require('./models/settings.model');

const BASE = { hostname: 'localhost', port: 3000 };

const req = (method, path, body, token) => new Promise((resolve, reject) => {
  const opts = {
    ...BASE, method, path,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  const r = http.request(opts, res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
      catch { resolve({ status: res.statusCode, body: raw }); }
    });
  });
  r.on('error', reject);
  if (body) r.write(JSON.stringify(body));
  r.end();
});

const RUN_ID = Date.now();
const TEST_EMAIL   = `testcashier_${RUN_ID}@celsopos.com`;
const TEST_PRODUCT = `Integration Test Item ${RUN_ID}`;

let passed = 0, failed = 0;
const ok  = (label, val, detail = '') => { console.log(`  ✅ ${label}`, detail); passed++; };
const fail = (label, val, detail = '') => { console.log(`  ❌ ${label}`, detail); failed++; };
const check = (label, cond, detail = '') => (cond ? ok : fail)(label, cond, detail);

async function run() {
  let adminToken;

  // ── STEP 1: Login ──────────────────────────────────────────
  console.log('\nSTEP 1 — Login as admin');
  const login = await req('POST', '/api/auth/login', { email: 'admin@celsopos.com', password: 'admin123' });
  check('POST /api/auth/login → 200',   login.status === 200);
  check('Response contains JWT token',   !!login.body.token);
  adminToken = login.body.token;

  // The seed admin owns store 1; capture its store_id to scope DB cross-checks
  // (every owned-table query is now per-store).
  const [adminRows] = await db.query("SELECT store_id FROM users WHERE email = 'admin@celsopos.com'");
  const adminStoreId = adminRows[0]?.store_id;

  // ── STEP 2: Register creates a NEW store + owner-admin (Phase 6.5) ──
  console.log('\nSTEP 2 — Register (creates a new isolated store)');
  const reg = await req('POST', '/api/auth/register', {
    fullName: 'Test Owner', email: TEST_EMAIL, password: 'owner12345',
  });
  check('POST /api/auth/register → 201', reg.status === 201);
  check('Response success flag is true', reg.body.success === true);

  const [userRows] = await db.query('SELECT id, role, store_id FROM users WHERE email = ?', [TEST_EMAIL]);
  check('Registered user is an admin of a NEW store',
    userRows.length === 1 && userRows[0].role === 'admin' &&
    !!userRows[0].store_id && userRows[0].store_id !== adminStoreId);
  const testUserId  = userRows[0]?.id;
  const testStoreId = userRows[0]?.store_id;

  // ── STEP 3: Browse products ────────────────────────────────
  console.log('\nSTEP 3 — Browse products');
  const products = await req('GET', '/api/products', null, adminToken);
  check('GET /api/products → 200',       products.status === 200);
  const productCount = products.body.data?.length ?? 0;
  check('Returns at least 10 products', productCount >= 10, `(got ${productCount})`);

  // ── STEP 4: Add a product ──────────────────────────────────
  console.log('\nSTEP 4 — Add product');
  const addRes = await req('POST', '/api/products', {
    name: TEST_PRODUCT, category: 'Test',
    price: 25.00, cost: 15.00, stock: 100, unit: 'piece',
  }, adminToken);
  check('POST /api/products → 201',      addRes.status === 201);
  const newId = addRes.body.data?.id;
  check('New product has an ID',         !!newId);

  const [prodRows] = await db.query('SELECT name, stock FROM products WHERE id = ?', [newId]);
  check('Product persisted in DB',       prodRows[0]?.name === TEST_PRODUCT);

  // ── STEP 5: Complete a sale ────────────────────────────────
  console.log('\nSTEP 5 — Complete a sale');
  const [sardineRow] = await db.query(
    "SELECT id FROM products WHERE name = 'Canned Sardines' AND is_active = 1 LIMIT 1"
  );
  const sardineId  = sardineRow[0]?.id;
  // Phase 5: stock enters via restock — ensure enough is on hand before the sale
  // (older runs / dev usage may have drawn it down to 0).
  await req('POST', `/api/inventory/${sardineId}/adjust`, { quantity: 50, type: 'restock', recordExpense: false }, adminToken);
  const [beforeRow] = await db.query('SELECT stock FROM products WHERE id = ?', [sardineId]);
  const stockBefore = beforeRow[0]?.stock;

  const saleRes = await req('POST', '/api/sales', {
    items: [{ productId: sardineId, name: 'Canned Sardines', price: 15.00, quantity: 2, lineTotal: 30.00 }],
    subtotal: 30.00, tax: 0, taxRate: 0, cartTaxOn: false,
    total: 30.00, payment: 50.00, change: 20.00,
  }, adminToken);
  check('POST /api/sales → 201',         saleRes.status === 201);
  check('Returns receipt number',        !!saleRes.body.data?.receiptNo, `(${saleRes.body.data?.receiptNo})`);

  const saleId = saleRes.body.data?.id;
  const [saleRows] = await db.query('SELECT total FROM sales WHERE id = ?', [saleId]);
  check('Sale row in DB with total=30',  parseFloat(saleRows[0]?.total) === 30.00);

  const [itemRows] = await db.query('SELECT product_name, quantity FROM sale_items WHERE sale_id = ?', [saleId]);
  check('sale_items row in DB',          itemRows[0]?.product_name === 'Canned Sardines' && itemRows[0]?.quantity === 2);

  const [stockRow] = await db.query('SELECT stock FROM products WHERE id = ?', [sardineId]);
  const stockAfter = stockRow[0]?.stock;
  check(`Stock decreased ${stockBefore}→${stockAfter}`, stockAfter === stockBefore - 2);

  const [adjRows] = await db.query(
    "SELECT qty, stock_after FROM inventory_adjustments WHERE product_id = ? AND type = 'sale' ORDER BY id DESC LIMIT 1",
    [sardineId]
  );
  check('Inventory adjustment logged',   adjRows[0]?.qty === 2 && adjRows[0]?.stock_after === stockAfter);

  // ── STEP 6: Analytics ──────────────────────────────────────
  console.log('\nSTEP 6 — Analytics');
  const summary = await req('GET', '/api/sales/summary', null, adminToken);
  check('GET /api/sales/summary → 200', summary.status === 200);

  // Window the KPI call to all-time so it matches SUM(total) over all sales
  // (the default 30-day window would exclude older history, e.g. seed sales).
  const today = dateInTz(settings.getTimezone());
  const kpis = await req('GET', '/api/analytics/kpis?from=2000-01-01&to=' + today, null, adminToken);
  check('GET /api/analytics/kpis → 200',   kpis.status === 200);
  check('totalRevenue is a number',         typeof kpis.body.data?.totalRevenue === 'number');
  check('transactionCount ≥ 1',            kpis.body.data?.transactionCount >= 1);

  // Cross-check: kpis revenue (all-time window) matches DB SUM(total)
  // Compare against the SAME store + date window + tz the KPI endpoint uses, so
  // a timezone-midnight-boundary sale can't make a windowed API differ from an
  // unwindowed raw SUM.
  const [dbRev] = await db.query(
    `SELECT COALESCE(SUM(total),0) AS rev FROM sales
     WHERE store_id = ? AND DATE(${localExpr('created_at')}) BETWEEN ? AND ?`,
    [adminStoreId, tzParam(), '2000-01-01', today]
  );
  const dbRevNum = parseFloat(dbRev[0].rev);
  check('KPI revenue matches this store\'s windowed DB SUM(total)', Math.abs(kpis.body.data?.totalRevenue - dbRevNum) < 0.01,
        `(api=${kpis.body.data?.totalRevenue}, db=${dbRevNum})`);

  // ── STEP 7: Low-stock inventory ────────────────────────────
  // Use our own product (restocked to a low qty) so the check doesn't depend on
  // drifting seed stock levels.
  console.log('\nSTEP 7 — Low-stock inventory');
  await req('POST', `/api/inventory/${newId}/adjust`, { quantity: 5, type: 'restock', recordExpense: false }, adminToken);
  const lowStock = await req('GET', '/api/inventory/low-stock', null, adminToken);
  check('GET /api/inventory/low-stock → 200', lowStock.status === 200);
  const names = (lowStock.body.data ?? []).map(p => p.name);
  check('Restocked-low product appears in low-stock', names.includes(TEST_PRODUCT));

  // Cleanup: remove the throwaway store + its owner (no data attached) so test
  // stores don't accumulate across runs.
  try {
    if (testUserId)  await db.query('DELETE FROM users WHERE id = ?', [testUserId]);
    if (testStoreId) await db.query('DELETE FROM stores WHERE id = ?', [testStoreId]);
  } catch (_) {}

  // ── Summary ────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)`);
  console.log('─'.repeat(45));

  await db.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('\nTest runner crashed:', err.message); process.exit(1); });
