// backend/controllers/billing.controller.js
//
// Lemon Squeezy (Merchant of Record) billing. LS is the source of truth for
// subscription state; webhooks mirror it into stores.* and effectivePlan()
// resolves entitlements from there per request. We call the LS REST API over
// fetch (no SDK dependency) so the server boots even before LS is configured —
// the authed endpoints return 503 until the env vars are set, and the webhook
// is only ever hit once LS is wired.
//
// Env (all optional at boot; see .env.example):
//   LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_WEBHOOK_SECRET,
//   LS_VARIANT_PLUS, LS_VARIANT_PRO, APP_URL

const crypto     = require('crypto');
const storeModel = require('../models/store.model');
const userModel  = require('../models/user.model');
const { effectivePlan, cashierSeats } = require('../config/plans');

const LS_API = 'https://api.lemonsqueezy.com/v1';

function lsConfigured() {
  return !!(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID);
}

// Authenticated JSON:API call to Lemon Squeezy.
async function lsFetch(path, options = {}) {
  const res = await fetch(LS_API + path, {
    ...options,
    headers: {
      'Accept':        'application/vnd.api+json',
      'Content-Type':  'application/vnd.api+json',
      'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
  if (!res.ok) {
    const msg = body && body.errors && body.errors[0] && body.errors[0].detail
      ? body.errors[0].detail : `Lemon Squeezy API error (${res.status})`;
    const e = new Error(msg); e.status = 502; throw e;
  }
  return body;
}

function variantForPlan(plan) {
  if (plan === 'pro')  return process.env.LS_VARIANT_PRO;
  if (plan === 'plus') return process.env.LS_VARIANT_PLUS;
  return null;
}

// Reverse map: LS variant id -> our plan key (read at call time so it picks up
// env set after boot). Unknown variant falls back to free (defensive).
function planForVariant(variantId) {
  const v = String(variantId);
  if (v === String(process.env.LS_VARIANT_PRO))  return 'pro';
  if (v === String(process.env.LS_VARIANT_PLUS)) return 'plus';
  return 'free';
}

// Map an LS subscription status onto our stores.subscription_status enum.
//   active / on_trial   -> active   (entitled)
//   past_due / unpaid   -> past_due (effective Free until paid; see effectivePlan)
//   cancelled           -> active   (keep entitled until the period actually ends)
//   expired / paused    -> canceled (effective Free)
//   unknown             -> past_due (effective Free) — never GRANT entitlement on
//                          a status we don't recognise; deny until a known event.
function mapStatus(lsStatus) {
  switch (lsStatus) {
    case 'active':
    case 'on_trial':   return 'active';
    case 'past_due':
    case 'unpaid':     return 'past_due';
    case 'cancelled':  return 'active';
    case 'expired':
    case 'paused':     return 'canceled';
    default:           return 'past_due';
  }
}

// ── POST /api/billing/checkout  { plan: 'plus' | 'pro' } ──────────────────
// Returns a hosted LS checkout URL. custom_data.store_id links the eventual
// subscription back to this store in the webhook.
const checkout = async (req, res, next) => {
  try {
    if (!lsConfigured()) {
      return res.status(503).json({ success: false, message: 'Billing is not configured yet.' });
    }
    const plan = req.body && req.body.plan;
    if (plan !== 'plus' && plan !== 'pro') {
      return res.status(400).json({ success: false, message: "plan must be 'plus' or 'pro'" });
    }
    const variantId = variantForPlan(plan);
    if (!variantId) {
      return res.status(503).json({ success: false, message: `No Lemon Squeezy variant configured for ${plan}.` });
    }

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: req.user.email,
            custom: { store_id: String(req.user.storeId) },
          },
          product_options: {
            redirect_url: `${process.env.APP_URL || ''}/pages/billing.html?ok=1`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };

    const body = await lsFetch('/checkouts', { method: 'POST', body: JSON.stringify(payload) });
    const url = body && body.data && body.data.attributes && body.data.attributes.url;
    if (!url) {
      return res.status(502).json({ success: false, message: 'Lemon Squeezy did not return a checkout URL.' });
    }
    res.json({ success: true, url });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── POST /api/billing/portal ──────────────────────────────────────────────
// Returns the LS customer-portal URL (signed, lives on the subscription) so the
// owner can update card / cancel.
const portal = async (req, res, next) => {
  try {
    if (!lsConfigured()) {
      return res.status(503).json({ success: false, message: 'Billing is not configured yet.' });
    }
    const subId = req.store && req.store.ls_subscription_id;
    if (!subId) {
      return res.status(400).json({ success: false, message: 'No active subscription to manage yet.' });
    }
    const body = await lsFetch(`/subscriptions/${subId}`);
    const portalUrl = body && body.data && body.data.attributes &&
      body.data.attributes.urls && body.data.attributes.urls.customer_portal;
    if (!portalUrl) {
      return res.status(502).json({ success: false, message: 'Lemon Squeezy did not return a portal URL.' });
    }
    res.json({ success: true, url: portalUrl });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── GET /api/billing/state ────────────────────────────────────────────────
// Plan/status/trial + seat usage for the Billing page. No LS call — reads the
// mirrored store row, so it works even before LS is configured.
const state = async (req, res, next) => {
  try {
    const seatsUsed = await userModel.countActiveCashiers(req.user.storeId);
    res.json({
      success: true,
      data: {
        plan:        req.plan,
        status:      req.store.subscription_status,
        trialEndsAt: req.store.trial_ends_at || null,
        seatsUsed,
        seatsTotal:  cashierSeats(req.plan),
        configured:  lsConfigured(),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/billing/webhook ─────────────────────────────────────────────
// Mounted in server.js BEFORE express.json() with express.raw so req.body is the
// raw Buffer the HMAC is computed over. No auth middleware — authenticity is the
// X-Signature HMAC. Idempotent against LS re-deliveries.
const _processed = new Map();           // `${subId}:${updatedAt}` -> timestamp
const _IDEMP_MAX = 1000;

function _alreadyProcessed(key) {
  if (_processed.has(key)) return true;
  _processed.set(key, Date.now());
  if (_processed.size > _IDEMP_MAX) {
    // Drop the oldest ~half to bound memory (single-instance cache).
    const cutoff = Array.from(_processed.keys()).slice(0, Math.floor(_IDEMP_MAX / 2));
    cutoff.forEach(k => _processed.delete(k));
  }
  return false;
}

const webhook = async (req, res) => {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) return res.sendStatus(500);   // not configured — nothing to verify against

  // 1. Verify HMAC over the RAW body (req.body is a Buffer here).
  try {
    const sig = req.get('X-Signature') || '';
    const digest = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    const a = Buffer.from(digest, 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.sendStatus(400);
    }
  } catch (_) {
    return res.sendStatus(400);
  }

  // 2. Parse + apply.
  try {
    const evt       = JSON.parse(req.body.toString());
    const attr      = (evt.data && evt.data.attributes) || {};
    const subId     = evt.data && evt.data.id;
    const eventName = (evt.meta && evt.meta.event_name) || '';
    const storeId   = Number(evt.meta && evt.meta.custom_data && evt.meta.custom_data.store_id);

    // Idempotency: ignore re-deliveries of the SAME event for the same
    // subscription state. The event name is part of the key so two distinct
    // events that happen to share an updated_at (e.g. _updated + _payment_success)
    // aren't collapsed into one.
    const idempKey = `${subId}:${eventName}:${attr.updated_at || ''}`;
    if (_alreadyProcessed(idempKey)) return res.sendStatus(200);

    if (storeId) {
      const plan   = planForVariant(attr.variant_id);
      const status = mapStatus(attr.status);

      await storeModel.updateBilling(storeId, {
        plan,
        subscription_status: status,
        trial_ends_at:       null,                       // a real subscription supersedes the no-card trial
        ls_subscription_id:  subId ? String(subId) : null,
        ls_customer_id:      attr.customer_id ? String(attr.customer_id) : null,
      });

      // Reconcile cashier seats to the now-effective plan (downgrade suspends,
      // re-upgrade reactivates). Owner is never touched.
      const eff = effectivePlan({ subscription_status: status, plan, trial_ends_at: null });
      await userModel.reconcileCashierSeats(storeId, cashierSeats(eff));
    }

    return res.sendStatus(200);
  } catch (err) {
    // Non-2xx tells LS to retry (with backoff) — better than silently dropping a
    // transient DB error on a billing event.
    console.error('[billing] webhook apply failed:', err.message);
    return res.sendStatus(500);
  }
};

module.exports = { checkout, portal, state, webhook };
