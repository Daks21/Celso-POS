// backend/test-recovery.js — Phase 6.7 manual password recovery + support tickets.
// Exercises the full lifecycle end-to-end against a RUNNING server on :3000, with
// direct DB reads for assertions, and cleans up every created row in finally.
//
// Usage (from backend/, with the API server already running):
//   node test-recovery.js
//
// Mirrors the test-integration / test-tenancy harness (http + check + RUN_ID).

const dotenv = require('dotenv');
dotenv.config();
const db     = require('./config/db.config');
const http   = require('http');
const bcrypt = require('bcrypt');

const BASE = { hostname: 'localhost', port: Number(process.env.TEST_PORT) || 3000 };

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

let passed = 0, failed = 0;
const check = (label, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + label, detail); passed++; }
  else { console.log('  ❌ ' + label, detail); failed++; }
};

const RUN = Date.now();
const OWNER_EMAIL = `rec_owner_${RUN}@celsopos.com`;
const OWNER_PW    = 'MabuhayTindahan99';
const NEW_PW      = 'BagongPasswordKo123';
const MOBILE      = '09171234567';
const MOBILE_ALT  = '+639171234567';
const POB         = 'Cebu City';
const SA_EMAIL    = `rec_super_${RUN}@celsopos.com`;
const SA_PW       = 'OperatorMabuhay123';
const UNKNOWN     = `rec_nobody_${RUN}@celsopos.com`;

let superId = null, ownerId = null, storeId = null;

async function run() {
  // Seed a temporary super-admin (known password) for the operator-side calls.
  const saHash = await bcrypt.hash(SA_PW, 10);
  const [sa] = await db.query(
    "INSERT INTO users (full_name, email, password, role, store_id, is_active) VALUES (?,?,?,'superadmin',NULL,1)",
    ['Recovery Test Operator', SA_EMAIL, saHash]
  );
  superId = sa.insertId;

  console.log('\n1 — Register owner with mobile + place of birth');
  let r = await req('POST', '/api/auth/register', {
    fullName: 'Recovery Owner', email: OWNER_EMAIL, password: OWNER_PW, mobile: MOBILE, securityAnswer: POB });
  check('register → 201', r.status === 201, r.body && r.body.message);
  const [urows] = await db.query('SELECT id, store_id, mobile, security_answer_hash FROM users WHERE email=?', [OWNER_EMAIL]);
  ownerId = urows[0] && urows[0].id; storeId = urows[0] && urows[0].store_id;
  check('mobile stored canonical 09XXXXXXXXX', urows[0] && urows[0].mobile === '09171234567', urows[0] && urows[0].mobile);
  check('security answer is bcrypt-hashed (not plaintext)',
    urows[0] && urows[0].security_answer_hash && urows[0].security_answer_hash.startsWith('$2') && urows[0].security_answer_hash !== POB);

  console.log('\n2 — register without recovery fields is rejected (400)');
  r = await req('POST', '/api/auth/register', { fullName: 'No Recovery', email: `norec_${RUN}@celsopos.com`, password: OWNER_PW });
  check('register missing fields → 400', r.status === 400, r.body && r.body.message);

  console.log('\n3 — Normal login (mustChangePassword false)');
  r = await req('POST', '/api/auth/login', { email: OWNER_EMAIL, password: OWNER_PW });
  check('login → 200', r.status === 200);
  check('mustChangePassword=false', r.body && r.body.mustChangePassword === false);

  console.log('\n4 — Forgot-password (alt mobile format + PoB) → generic 200');
  r = await req('POST', '/api/auth/forgot-password', { email: OWNER_EMAIL, mobile: MOBILE_ALT, securityAnswer: POB, historyAnswers: 'signed up today' });
  check('forgot → generic 200', r.status === 200 && r.body && r.body.success === true);

  console.log('\n4b — Forgot-password for an UNKNOWN email → generic 200 but NO row stored');
  r = await req('POST', '/api/auth/forgot-password', { email: UNKNOWN, mobile: MOBILE, securityAnswer: POB });
  check('unknown forgot → same generic 200 (anti-enumeration)', r.status === 200 && r.body && r.body.success === true);
  const [unkCnt] = await db.query('SELECT COUNT(*) AS n FROM password_reset_requests WHERE email=?', [UNKNOWN]);
  check('no reviewable row created for an unknown email', unkCnt[0].n === 0, unkCnt[0].n);

  console.log('\n5 — Dedupe: 2nd submission keeps exactly one pending row');
  await req('POST', '/api/auth/forgot-password', { email: OWNER_EMAIL, mobile: MOBILE, securityAnswer: POB });
  const [openCnt] = await db.query("SELECT COUNT(*) AS n FROM password_reset_requests WHERE email=? AND status='pending'", [OWNER_EMAIL]);
  check('exactly 1 pending after dedupe', openCnt[0].n === 1, openCnt[0].n);

  console.log('\n6 — Super-admin login + list pending (scorecard)');
  r = await req('POST', '/api/auth/login', { email: SA_EMAIL, password: SA_PW });
  check('superadmin login → 200', r.status === 200);
  const saToken = r.body && r.body.token;
  r = await req('GET', '/api/admin/reset-requests?status=pending', null, saToken);
  check('list → 200', r.status === 200);
  const reqRow = r.body && r.body.data && r.body.data.find(x => x.email === OWNER_EMAIL);
  check('request present in list', !!reqRow);
  check('mobile_match=1 (alt format matched)', reqRow && reqRow.mobile_match === 1);
  check('answer_match=1', reqRow && reqRow.answer_match === 1);
  check('on-file mobile shown', reqRow && reqRow.onfile_mobile === '09171234567');

  console.log('\n7 — Step-up: wrong operator password → 401');
  r = await req('POST', '/api/admin/reset-requests/' + reqRow.id + '/approve', { operatorPassword: 'wrongwrongwrong' }, saToken);
  check('wrong step-up → 401', r.status === 401);

  console.log('\n8 — Approve → 12-hex code returned once');
  r = await req('POST', '/api/admin/reset-requests/' + reqRow.id + '/approve', { operatorPassword: SA_PW }, saToken);
  check('approve → 200', r.status === 200, r.body && r.body.message);
  const tempCode = r.body && r.body.data && r.body.data.tempPassword;
  check('temp code is 12 hex chars', /^[0-9a-f]{12}$/.test(tempCode || ''), tempCode);
  check('on-file mobile returned for delivery', r.body && r.body.data && r.body.data.onfileMobile === '09171234567');

  console.log('\n9 — DB: code hashed, flag + expiry set');
  const [pw] = await db.query('SELECT password, must_change_password, pw_reset_expires_at FROM users WHERE id=?', [ownerId]);
  check('must_change_password=1', pw[0].must_change_password === 1);
  check('pw_reset_expires_at set', !!pw[0].pw_reset_expires_at);
  check('password bcrypt-hashed, not the plaintext code', pw[0].password.startsWith('$2') && pw[0].password !== tempCode);

  console.log('\n10 — Temp-code login → mustChangePassword true');
  r = await req('POST', '/api/auth/login', { email: OWNER_EMAIL, password: tempCode });
  check('temp login → 200', r.status === 200);
  check('mustChangePassword=true', r.body && r.body.mustChangePassword === true);
  const ownerToken = r.body && r.body.token;

  console.log('\n11 — Forced-change gate blocks app routes (403)');
  r = await req('GET', '/api/products', null, ownerToken);
  check('gated → 403 PASSWORD_CHANGE_REQUIRED', r.status === 403 && r.body && r.body.code === 'PASSWORD_CHANGE_REQUIRED');

  console.log('\n12 — Change password; request auto-completes');
  r = await req('PUT', '/api/auth/password', { newPassword: NEW_PW }, ownerToken);
  check('change → 200', r.status === 200, r.body && r.body.message);
  const [pw2] = await db.query('SELECT must_change_password, pw_reset_expires_at FROM users WHERE id=?', [ownerId]);
  check('must_change_password cleared', pw2[0].must_change_password === 0);
  check('pw_reset_expires_at cleared', pw2[0].pw_reset_expires_at === null);
  const [reqAfter] = await db.query('SELECT status FROM password_reset_requests WHERE id=?', [reqRow.id]);
  check('request marked completed', reqAfter[0].status === 'completed', reqAfter[0].status);

  console.log('\n13 — Old code rejected; new password works');
  r = await req('POST', '/api/auth/login', { email: OWNER_EMAIL, password: tempCode });
  check('old temp code rejected', r.status === 401 || r.status === 403);
  r = await req('POST', '/api/auth/login', { email: OWNER_EMAIL, password: NEW_PW });
  check('new password login → 200 + flag false', r.status === 200 && r.body.mustChangePassword === false);
  const ownerToken2 = r.body.token;
  r = await req('GET', '/api/products', null, ownerToken2);
  check('app call works after change (200)', r.status === 200);

  console.log('\n14 — Step-up re-auth on sensitive changes (H1)');
  // Normal password change (must_change=0) now requires the current password.
  r = await req('PUT', '/api/auth/password', { newPassword: 'AnotherValidPass123' }, ownerToken2);
  check('normal password change without current password → 400', r.status === 400, `(got ${r.status})`);
  // Recovery update requires the current password (step-up).
  r = await req('PUT', '/api/auth/recovery', { mobile: '09991234567' }, ownerToken2);
  check('recovery update without current password → 400', r.status === 400, `(got ${r.status})`);
  r = await req('PUT', '/api/auth/recovery', { mobile: '09991234567', currentPassword: NEW_PW }, ownerToken2);
  check('recovery update with step-up → 200', r.status === 200, r.body && r.body.message);
  const [recRow] = await db.query('SELECT mobile FROM users WHERE id=?', [ownerId]);
  check('mobile updated on file', recRow[0].mobile === '09991234567', recRow[0].mobile);

  console.log('\n15 — Support ticket submit + operator inbox (auto-tagged)');
  r = await req('POST', '/api/support/tickets', { category: 'bug', message: 'Recovery test ticket ' + RUN }, ownerToken2);
  check('ticket submit → 201', r.status === 201);
  r = await req('GET', '/api/admin/tickets?status=open', null, saToken);
  const tkRow = r.body && r.body.data && r.body.data.find(t => t.message === 'Recovery test ticket ' + RUN);
  check('ticket visible to operator, tagged to store', !!tkRow && tkRow.store_id === storeId);

  console.log('\n15b — Duplicate ticket (identical text within the window) → 429');
  r = await req('POST', '/api/support/tickets', { category: 'bug', message: 'Recovery test ticket ' + RUN }, ownerToken2);
  check('duplicate ticket suppressed → 429', r.status === 429, r.body && r.body.message);

  console.log('\n16 — Notification counts shape');
  r = await req('GET', '/api/admin/notifications', null, saToken);
  check('counts present', r.body && r.body.data && typeof r.body.data.pendingResets === 'number' && typeof r.body.data.openTickets === 'number');

  console.log('\n17 — Operator surface 404 to a tenant (requireSuperAdmin)');
  r = await req('GET', '/api/admin/reset-requests', null, ownerToken2);
  check('tenant → 404 on operator route', r.status === 404);

  console.log('\n18 — Enumeration: unknown email still generic 200, no account created');
  r = await req('POST', '/api/auth/forgot-password', { email: UNKNOWN, mobile: MOBILE, securityAnswer: POB });
  check('unknown email → generic 200', r.status === 200 && r.body.success === true);
  const [unk] = await db.query('SELECT id FROM users WHERE email=?', [UNKNOWN]);
  check('no account created for unknown email', unk.length === 0);
}

async function cleanup() {
  try {
    if (storeId) await db.query('DELETE FROM support_tickets WHERE store_id=?', [storeId]);
    await db.query('DELETE FROM password_reset_requests WHERE email IN (?, ?)', [OWNER_EMAIL, UNKNOWN]);
    if (ownerId)  await db.query('DELETE FROM users WHERE id=?', [ownerId]);
    if (storeId)  await db.query('DELETE FROM stores WHERE id=?', [storeId]);
    if (superId)  await db.query('DELETE FROM users WHERE id=?', [superId]);
    console.log('\n[cleanup] removed test owner, store, super-admin, requests, tickets');
  } catch (e) { console.error('[cleanup] error:', e.message); }
}

(async () => {
  console.log('=== Phase 6.7 recovery + tickets test (server must be running on :3000) ===');
  try {
    await run();
  } catch (e) {
    console.error('\nTEST ERROR:', e.message);
    failed++;
  } finally {
    await cleanup();
    console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
    try { await db.end(); } catch (_) {}
    process.exit(failed ? 1 : 0);
  }
})();
