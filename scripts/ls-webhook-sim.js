// scripts/ls-webhook-sim.js — simulate a Lemon Squeezy subscription webhook.
//
// Crafts a realistic LS event, HMAC-signs it with your LEMONSQUEEZY_WEBHOOK_SECRET
// (the same way LS does), and POSTs it to your local /api/billing/webhook. Lets
// you test the post-checkout flow (store billing state + seat reconcile) WITHOUT
// a Lemon Squeezy account.
//
// Reads secret + variant ids from backend/.env (or process.env overrides).
// The server must be running with the SAME LEMONSQUEEZY_WEBHOOK_SECRET set.
//
// Usage (PowerShell, repo root):
//   node scripts/ls-webhook-sim.js <event> <plan> [storeId] [status]
// Examples:
//   node scripts/ls-webhook-sim.js subscription_created pro 1
//   node scripts/ls-webhook-sim.js subscription_payment_failed pro 1
//   node scripts/ls-webhook-sim.js subscription_expired pro 1
//   node scripts/ls-webhook-sim.js subscription_created pro 1 --badsig   (force a bad signature)

const crypto = require('crypto');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');

function loadEnv() {
  const p = path.join(__dirname, '..', 'backend', '.env');
  const env = {};
  try {
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(line => {
      if (/^\s*#/.test(line)) return;
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (_) {}
  return env;
}

const ENV = Object.assign(loadEnv(), process.env);  // process.env wins
const SECRET = ENV.LEMONSQUEEZY_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('LEMONSQUEEZY_WEBHOOK_SECRET is not set in backend/.env (and the server needs it too).');
  process.exit(1);
}

const args = process.argv.slice(2);
const badSig = args.includes('--badsig');
const [event = 'subscription_created', plan = 'pro', storeId = '1', statusArg] =
  args.filter(a => a !== '--badsig');

const STATUS_BY_EVENT = {
  subscription_created:          'active',
  subscription_updated:          'active',
  subscription_payment_success:  'active',
  subscription_payment_failed:   'past_due',
  subscription_cancelled:        'cancelled',
  subscription_expired:          'expired',
};
const status = statusArg || STATUS_BY_EVENT[event] || 'active';

const variant = plan === 'pro'
  ? (ENV.LS_VARIANT_PRO  || '1002')
  : (ENV.LS_VARIANT_PLUS || '1001');

const now = new Date().toISOString();
const evt = {
  meta: { event_name: event, custom_data: { store_id: String(storeId) } },
  data: {
    type: 'subscriptions',
    id:   's' + String(Date.now()).slice(-8),
    attributes: {
      store_id:    Number(ENV.LEMONSQUEEZY_STORE_ID || 0),
      customer_id: 999001,
      variant_id:  Number(variant),
      status,
      updated_at:  now,
      created_at:  now,
    },
  },
};

const body = JSON.stringify(evt);
let sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
if (badSig) sig = 'deadbeef' + sig.slice(8);

const req = http.request({
  hostname: 'localhost', port: 3000, path: '/api/billing/webhook', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Signature': sig, 'Content-Length': Buffer.byteLength(body) },
}, res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    console.log(`→ ${event} (plan=${plan}, status=${status}, variant=${variant}, store=${storeId})${badSig ? ' [BAD SIG]' : ''}`);
    console.log(`  webhook responded: ${res.statusCode}  ${res.statusCode === 200 ? '(applied)' : res.statusCode === 400 ? '(rejected — signature)' : res.statusCode === 500 ? '(server has no/!= secret)' : ''}`);
  });
});
req.on('error', e => console.error('POST failed:', e.message, '\nIs the server running on :3000?'));
req.write(body);
req.end();
