// backend/test-tenancy.js — Phase 6.5 §9 TENANT-ISOLATION SUITE (launch gate).
//
// Spins up two real stores (A & B) via signup, seeds each with a product, a
// sale, and a finance entry, then asserts that one store's token can NEVER read
// or mutate the other's data, that cross-store checkout is rejected, that
// aggregate totals don't bleed across tenants, and that a cashier is gated out
// of plan/role-locked features. Also unit-checks the entitlements math.
//
// PREREQUISITES (same as the other suites):
//   - The API server must be running on localhost:3000 (npm run dev).
//   - A live MySQL DB with the Phase 6.5 schema (stores + store_id) loaded.
//   - Run from the backend/ dir:  node test-tenancy.js
//
// Note: cashiers are normally created on the Team page (Phase 6.5 §7, not built
// yet), so this suite inserts the test cashier directly via SQL. It cleans up
// every row it creates at the end (best-effort — skipped if the app DB user
// lacks DELETE).

const dotenv = require('dotenv');
dotenv.config();
const db     = require('./config/db.config');
const bcrypt = require('bcrypt');
const http   = require('http');
const { effectivePlan, hasFeature, cashierSeats } = require('./config/plans');

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

let passed = 0, failed = 0;
const check = (label, cond, detail = '') => {
  if (cond) { console.log('  ✅', label, detail); passed++; }
  else      { console.log('  ❌', label, detail); failed++; }
};

// Seed one store (as its admin token): a product (restocked), a sale, a capital
// entry. Returns the created ids so the cross-tenant probes can target them.
async function seedStore(token, runId, tag) {
  const p = await req('POST', '/api/products',
    { name: `Item ${tag} ${runId}`, category: 'Test', price: 20, cost: 10, unit: 'piece' }, token);
  const pid = p.body.data && p.body.data.id;
  await req('POST', `/api/inventory/${pid}/adjust`, { quantity: 10, type: 'restock' }, token);
  const sale = await req('POST', '/api/sales', {
    items: [{ productId: pid, name: 'x', price: 20, quantity: 1, lineTotal: 20 }],
    subtotal: 20, tax: 0, taxRate: 0, cartTaxOn: false, total: 20, payment: 20,
  }, token);
  const sid = sale.body.data && sale.body.data.id;
  const fin = await req('POST', '/api/finance',
    { type: 'capital_in', category: 'own', amount: 1000, occurred_at: '2026-01-01' }, token);
  const fid = fin.body.data && fin.body.data.id;
  return { pid, sid, fid, productOk: p.status === 201, saleOk: sale.status === 201, finOk: fin.status === 201 };
}

async function run() {
  // Preflight — fail loudly if the server isn't up.
  try {
    const health = await req('GET', '/api/health');
    if (health.status !== 200) throw new Error('health not 200');
  } catch (e) {
    console.error('\n✗ API server not reachable on localhost:3000 — start it (npm run dev) first.\n');
    process.exit(1);
  }

  const RUN  = Date.now();
  const PASS = 'owner12345';
  const aEmail = `tenantA_${RUN}@celsopos.com`;
  const bEmail = `tenantB_${RUN}@celsopos.com`;
  let storeA, storeB;

  console.log('\n── Setup: two stores via signup ───────────────────────────');
  const regA = await req('POST', '/api/auth/register', { fullName: 'Owner A', email: aEmail, password: PASS });
  const regB = await req('POST', '/api/auth/register', { fullName: 'Owner B', email: bEmail, password: PASS });
  check('Store A signup → 201', regA.status === 201);
  check('Store B signup → 201', regB.status === 201);

  const loginA = await req('POST', '/api/auth/login', { email: aEmail, password: PASS });
  const loginB = await req('POST', '/api/auth/login', { email: bEmail, password: PASS });
  const tokenA = loginA.body.token, tokenB = loginB.body.token;
  check('Store A login → 200 + token', loginA.status === 200 && !!tokenA);
  check('Store B login → 200 + token', loginB.status === 200 && !!tokenB);

  const [aRows] = await db.query('SELECT store_id FROM users WHERE email = ?', [aEmail]);
  const [bRows] = await db.query('SELECT store_id FROM users WHERE email = ?', [bEmail]);
  storeA = aRows[0] && aRows[0].store_id;
  storeB = bRows[0] && bRows[0].store_id;
  check('Each signup created a distinct store', !!storeA && !!storeB && storeA !== storeB, `(A=${storeA}, B=${storeB})`);

  const [stA] = await db.query('SELECT subscription_status, trial_ends_at, owner_user_id FROM stores WHERE id = ?', [storeA]);
  check('New store starts trialing', stA[0] && stA[0].subscription_status === 'trialing');
  check('Trial ends ~14 days out', stA[0] && new Date(stA[0].trial_ends_at) > new Date(Date.now() + 13 * 86400000));
  check('Store owner_user_id is set', !!(stA[0] && stA[0].owner_user_id));

  console.log('\n── Setup: seed data in each store ─────────────────────────');
  const A = await seedStore(tokenA, RUN, 'A');
  const B = await seedStore(tokenB, RUN, 'B');
  check('Store A seeded (product+sale+finance)', A.productOk && A.saleOk && A.finOk, `(p=${A.pid}, s=${A.sid}, f=${A.fid})`);
  check('Store B seeded (product+sale+finance)', B.productOk && B.saleOk && B.finOk, `(p=${B.pid}, s=${B.sid}, f=${B.fid})`);

  console.log('\n── Read isolation: A never sees B ─────────────────────────');
  const aProducts = await req('GET', '/api/products', null, tokenA);
  check("A's product list contains A, excludes B",
    aProducts.body.data.some(p => p.id === A.pid) && aProducts.body.data.every(p => p.id !== B.pid));
  check("A GET B's product by id → 404", (await req('GET', `/api/products/${B.pid}`, null, tokenA)).status === 404);

  const aSales = await req('GET', '/api/sales', null, tokenA);
  check("A's sales list excludes B", aSales.body.data.every(s => s.id !== B.sid));
  check("A GET B's sale by id → 404", (await req('GET', `/api/sales/${B.sid}`, null, tokenA)).status === 404);

  const aFin = await req('GET', '/api/finance', null, tokenA);
  check("A's finance list excludes B", Array.isArray(aFin.body.data) && aFin.body.data.every(r => r.id !== B.fid));

  console.log('\n── Mutate-by-id isolation: A cannot touch B ───────────────');
  check("A PUT B's product → 404",
    (await req('PUT', `/api/products/${B.pid}`, { name: 'Hacked', category: 'x', price: 9, cost: 1, unit: 'piece' }, tokenA)).status === 404);
  check("A DELETE B's product → 404", (await req('DELETE', `/api/products/${B.pid}`, null, tokenA)).status === 404);
  check("A DELETE B's finance entry → 404", (await req('DELETE', `/api/finance/${B.fid}`, null, tokenA)).status === 404);
  check("A PUT B's sale → 404",
    (await req('PUT', `/api/sales/${B.sid}`, { items: [], payment: 20, cartTaxOn: false }, tokenA)).status === 404);

  const [bProd] = await db.query('SELECT name, is_active FROM products WHERE id = ?', [B.pid]);
  check("B's product is intact after A's attempts", bProd[0] && bProd[0].name !== 'Hacked' && bProd[0].is_active === 1);

  console.log('\n── Cross-store checkout is rejected ───────────────────────');
  const crossCheckout = await req('POST', '/api/sales', {
    items: [{ productId: B.pid, name: 'x', price: 20, quantity: 1, lineTotal: 20 }],
    subtotal: 20, tax: 0, taxRate: 0, cartTaxOn: false, total: 20, payment: 20,
  }, tokenA);
  check("A checkout referencing B's productId → 400", crossCheckout.status === 400);

  console.log('\n── Aggregates do not bleed across tenants ─────────────────');
  // Each store has exactly: capital_in 1000 + one sale of 20 → moneyIn 1020.
  const aSummary = await req('GET', '/api/finance/summary', null, tokenA);
  check("A finance moneyIn = 1020 (B's 1000 not counted)",
    Math.abs((aSummary.body.data.moneyIn ?? 0) - 1020) < 0.01, `(got ${aSummary.body.data.moneyIn})`);
  const aKpis = await req('GET', '/api/analytics/kpis', null, tokenA);
  check("A KPI revenue = 20 (B's sale not counted)",
    Math.abs((aKpis.body.data.totalRevenue ?? 0) - 20) < 0.01, `(got ${aKpis.body.data.totalRevenue})`);

  console.log('\n── Cashier role gating (cashier inserted into Store A) ────');
  const cashierEmail = `tenantAcashier_${RUN}@celsopos.com`;
  const hash = await bcrypt.hash(PASS, 10);
  await db.query(
    'INSERT INTO users (full_name, email, password, role, store_id, is_active) VALUES (?,?,?,?,?,1)',
    ['Cashier A', cashierEmail, hash, 'cashier', storeA]
  );
  const loginC = await req('POST', '/api/auth/login', { email: cashierEmail, password: PASS });
  const tokenC = loginC.body.token;
  check('Cashier login → 200 + token', loginC.status === 200 && !!tokenC);
  check('Cashier GET /api/finance → 402 (plan/role gate)', (await req('GET', '/api/finance', null, tokenC)).status === 402);
  check('Cashier GET /api/analytics/kpis → 402', (await req('GET', '/api/analytics/kpis', null, tokenC)).status === 402);
  check('Cashier POST /api/ai/chat → 402', (await req('POST', '/api/ai/chat', { message: 'hi' }, tokenC)).status === 402);
  check('Cashier GET /api/products → 200 (POS needs it)', (await req('GET', '/api/products', null, tokenC)).status === 200);
  check('Cashier GET /api/sales → 200 (History needs it)', (await req('GET', '/api/sales', null, tokenC)).status === 200);

  console.log('\n── Entitlements math (unit) ───────────────────────────────');
  const now = Date.now();
  check('effectivePlan active → plan',          effectivePlan({ subscription_status: 'active', plan: 'plus' }) === 'plus');
  check('effectivePlan trialing(future) → pro', effectivePlan({ subscription_status: 'trialing', trial_ends_at: new Date(now + 86400000) }) === 'pro');
  check('effectivePlan trialing(past) → free',  effectivePlan({ subscription_status: 'trialing', trial_ends_at: new Date(now - 86400000) }) === 'free');
  check('effectivePlan none → free',            effectivePlan({ subscription_status: 'none' }) === 'free');
  check('cashierSeats free/plus/pro = 0/1/2',   cashierSeats('free') === 0 && cashierSeats('plus') === 1 && cashierSeats('pro') === 2);
  check('hasFeature(pro,cashier,finance) false', hasFeature('pro', 'cashier', 'finance') === false);
  check('hasFeature(pro,admin,ai) true',         hasFeature('pro', 'admin', 'ai') === true);

  // ── Cleanup (best-effort) ────────────────────────────────────
  console.log('\n── Cleanup ────────────────────────────────────────────────');
  try {
    const ids = [storeA, storeB];
    await db.query('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE store_id IN (?,?))', ids);
    await db.query('DELETE FROM inventory_adjustments WHERE store_id IN (?,?)', ids);
    await db.query('DELETE FROM cash_movements WHERE store_id IN (?,?)', ids);
    await db.query('DELETE FROM sales WHERE store_id IN (?,?)', ids);
    await db.query('DELETE FROM products WHERE store_id IN (?,?)', ids);
    await db.query('DELETE FROM users WHERE store_id IN (?,?)', ids);
    await db.query('DELETE FROM stores WHERE id IN (?,?)', ids);
    console.log('  🧹 removed test stores A & B and all their rows');
  } catch (e) {
    console.log('  ⚠  cleanup skipped (app DB user may lack DELETE):', e.message);
    console.log(`     Manually remove test stores ${storeA} & ${storeB} if needed.`);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(failed === 0
    ? `✅ TENANT ISOLATION GREEN — ${passed} checks passed`
    : `❌ ${failed} FAILED, ${passed} passed — DO NOT SHIP until green`);
  await db.end();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error('\n✗ Test run crashed:', e.message);
  try { await db.end(); } catch (_) {}
  process.exit(1);
});
