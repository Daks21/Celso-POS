// scripts/_billing-state.js — print store 1's effective billing state (dev helper).
const http = require('http');
function call(method, path, body, token) {
  return new Promise(r => {
    const d = body ? JSON.stringify(body) : null;
    const q = http.request({ hostname: 'localhost', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}) } },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { try { r({ s: res.statusCode, b: JSON.parse(s) }); } catch { r({ s: res.statusCode, b: s }); } }); });
    q.on('error', e => r({ s: 0, b: e.message })); if (d) q.write(d); q.end();
  });
}
(async () => {
  const login = await call('POST', '/api/auth/login', { email: 'admin@celsopos.com', password: 'admin123' });
  if (login.s !== 200) { console.log('   state: login failed', login.s); return; }
  const st = await call('GET', '/api/billing/state', null, login.b.token);
  const d = (st.b && st.b.data) || {};
  console.log('   → effective plan=' + d.plan + '  status=' + d.status + '  seats=' + d.seatsUsed + '/' + d.seatsTotal + '  trialEndsAt=' + d.trialEndsAt);
})();
