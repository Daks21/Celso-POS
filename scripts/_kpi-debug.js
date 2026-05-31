// Temp debug: does a sale created "now" show in a fresh store's default-window KPI?
const http = require('http'); const fs = require('fs'); const path = require('path');
const envPath = path.join(__dirname, '..', 'backend', '.env');
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(l => { if (/^\s*#/.test(l)) return; const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const db = require(path.join(__dirname, '..', 'backend', 'config', 'db.config'));
function call(method, p, body, token) {
  return new Promise(r => { const d = body ? JSON.stringify(body) : null;
    const q = http.request({ hostname: 'localhost', port: 3000, path: p, method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}) } },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { try { r({ s: res.statusCode, b: JSON.parse(s) }); } catch { r({ s: res.statusCode, b: s }); } }); });
    q.on('error', e => r({ s: 0, b: e.message })); if (d) q.write(d); q.end(); });
}
(async () => {
  const RUN = Date.now(); const email = 'kpidbg_' + RUN + '@x.com';
  await call('POST', '/api/auth/register', { fullName: 'KPI Dbg', email, password: 'pass12345' });
  const L = await call('POST', '/api/auth/login', { email, password: 'pass12345' }); const tok = L.b.token;
  const P = await call('POST', '/api/products', { name: 'K' + RUN, category: 'T', price: 20, cost: 10, unit: 'piece' }, tok); const pid = P.b.data.id;
  await call('POST', '/api/inventory/' + pid + '/adjust', { quantity: 10, type: 'restock' }, tok);
  const S = await call('POST', '/api/sales', { items: [{ productId: pid, name: 'x', price: 20, quantity: 1, lineTotal: 20 }], subtotal: 20, tax: 0, taxRate: 0, cartTaxOn: false, total: 20, payment: 20 }, tok);
  const sid = S.b.data.id;
  const [srow] = await db.query("SELECT store_id, created_at, DATE(CONVERT_TZ(created_at,'+00:00','+08:00')) AS bucket08, NOW() AS dbnow FROM sales WHERE id = ?", [sid]);
  const [strow] = await db.query("SELECT timezone FROM stores WHERE id = ?", [srow[0].store_id]);
  const kdef = await call('GET', '/api/analytics/kpis', null, tok);
  const kwin = await call('GET', '/api/analytics/kpis?from=2000-01-01&to=2099-12-31', null, tok);
  const ksum = await call('GET', '/api/analytics/summary', null, tok);
  console.log('store tz:', strow[0] && strow[0].timezone);
  console.log('sale:', JSON.stringify(srow[0]));
  console.log('KPI default-window revenue:', kdef.b.data && kdef.b.data.totalRevenue);
  console.log('KPI wide-window revenue   :', kwin.b.data && kwin.b.data.totalRevenue);
  console.log('analytics/summary todayRevenue:', ksum.b.data && ksum.b.data.todayRevenue);
  const storeId = srow[0].store_id;
  try {
    await db.query('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE store_id=?)', [storeId]);
    await db.query('DELETE FROM cash_movements WHERE store_id=?', [storeId]);
    await db.query('DELETE FROM inventory_adjustments WHERE store_id=?', [storeId]);
    await db.query('DELETE FROM sales WHERE store_id=?', [storeId]);
    await db.query('DELETE FROM products WHERE store_id=?', [storeId]);
    await db.query('DELETE FROM users WHERE store_id=?', [storeId]);
    await db.query('DELETE FROM stores WHERE id=?', [storeId]);
    console.log('cleaned up store', storeId);
  } catch (e) { console.log('cleanup err', e.message); }
  await db.end();
})();
