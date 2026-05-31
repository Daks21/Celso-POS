// scripts/ls-ids.js — print your Lemon Squeezy Store ID and subscription Variant
// IDs so you can fill LEMONSQUEEZY_STORE_ID / LS_VARIANT_PLUS / LS_VARIANT_PRO.
//
// Usage (PowerShell, from the repo root):
//   $env:LEMONSQUEEZY_API_KEY="lsq_test_xxxxxxxx"; node scripts/ls-ids.js
//
// Make sure you created the key in the SAME mode (Test vs Live) you'll run in —
// test-mode keys only see test-mode stores/variants.

const KEY = process.env.LEMONSQUEEZY_API_KEY;
if (!KEY) {
  console.error('Set LEMONSQUEEZY_API_KEY first, e.g.\n  $env:LEMONSQUEEZY_API_KEY="lsq_test_..."; node scripts/ls-ids.js');
  process.exit(1);
}

const headers = { Accept: 'application/vnd.api+json', Authorization: 'Bearer ' + KEY };

async function get(path) {
  const res = await fetch('https://api.lemonsqueezy.com/v1' + path, { headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && body.errors && body.errors[0] ? body.errors[0].detail : res.status;
    throw new Error('LS API ' + path + ' -> ' + msg);
  }
  return body;
}

(async () => {
  const stores = await get('/stores');
  console.log('\n=== STORES ===');
  (stores.data || []).forEach(s =>
    console.log(`  LEMONSQUEEZY_STORE_ID=${s.id}   (name: "${s.attributes.name}", mode: ${s.attributes.test_mode ? 'TEST' : 'LIVE'})`)
  );

  const variants = await get('/variants');
  console.log('\n=== VARIANTS (pick the two subscription ones, interval=month) ===');
  (variants.data || []).forEach(v => {
    const a = v.attributes;
    const price = a.price != null ? '$' + (a.price / 100).toFixed(2) : '?';
    console.log(`  id=${v.id}   name="${a.name}"   price=${price}   interval=${a.interval || '-'}`);
  });
  console.log('\nMap your $8 variant -> LS_VARIANT_PLUS and your $12 variant -> LS_VARIANT_PRO.\n');
})().catch(e => { console.error('\nError:', e.message); process.exit(1); });
