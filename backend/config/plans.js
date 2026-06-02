// Entitlements model — the single source of truth for what each plan unlocks.
// Pure logic, no DB/network: imported by both the server (feature gating in
// tenant.middleware) and mirrored to the client (UI nav hiding). Plans resolve
// from the store's billing state in the DB per request — never from the JWT.
//
// Phase 6.6: prices are PHP (manual GCash bridge); paid entitlement runs on a
// `paid_until` window with a short grace period, resolved lazily per request
// (no scheduler) exactly like the no-card trial. Lemon Squeezy is retired; the
// provider-agnostic spine (plan + paid_until + status) carries over to PayMongo.

const GRACE_DAYS = 3;            // days of access after the due date before lapse

// Four tiers (PHP, monthly). Features are tiered AND seats grow with price:
//   free  ₱0     0 seats  core POS only
//   basic ₱299   0 seats  + Finance + Analytics + dashboard charts (solo owner)
//   plus  ₱799   1 seat   + Advanced Analytics + AI (Os)
//   pro   ₱1299  2 seats  same features as Plus, second cashier seat
const PLANS = {
  free: {
    label: 'Free', pricePhp: 0, cashierSeats: 0,
    features: ['dashboard_basic', 'order', 'inventory', 'products', 'history'],
  },
  basic: {
    label: 'Basic', pricePhp: 299, cashierSeats: 0,
    features: ['dashboard_basic', 'dashboard_charts', 'order', 'inventory',
               'products', 'history', 'finance', 'analytics'],
  },
  plus: {
    label: 'Plus', pricePhp: 799, cashierSeats: 1,
    features: ['dashboard_basic', 'dashboard_charts', 'order', 'inventory',
               'products', 'history', 'finance', 'analytics',
               'advanced_analytics', 'ai'],
  },
  pro: {
    label: 'Pro', pricePhp: 1299, cashierSeats: 2,
    features: ['dashboard_basic', 'dashboard_charts', 'order', 'inventory',
               'products', 'history', 'finance', 'analytics',
               'advanced_analytics', 'ai'],
  },
};

// A cashier's reachable features are capped to this set, then intersected with
// whatever the store's plan unlocks (a cashier on Pro still can't open Finance).
const CASHIER_FEATURES = ['order', 'history'];

// Resolve a store's billing situation right now. Returns the effective plan plus
// a `state` the UI uses for the reminder cards:
//   trial  — within the 14-day no-card Pro trial (effective Pro).
//   active — paid and inside the paid_until window (or legacy/grandfathered).
//   grace  — past the due date but within GRACE_DAYS (still entitled).
//   free   — everything else (trial expired, lapsed past grace, or never paid).
// Lapse is never written back to the row; date math decides each request.
function resolveBilling(store, now = new Date()) {
  const trialEndsAt = (store && store.trial_ends_at) || null;

  // No-card 14-day trial (status set at signup) grants BASIC — Finance + Analytics,
  // the features a small store cares about, without giving away AI / extra seats.
  if (store && store.subscription_status === 'trialing' && trialEndsAt &&
      new Date(trialEndsAt) > now) {
    return { plan: 'basic', state: 'trial', paidUntil: null, graceEndsAt: null, trialEndsAt };
  }

  const paid = store && store.plan && store.plan !== 'free' && !!PLANS[store.plan];
  // Operator revocation ('canceled') is absolute and wins over any paid_until.
  if (paid && store.subscription_status !== 'canceled') {
    if (!store.paid_until) {
      // No local period set: the legacy single-tenant store (migrated as
      // pro/active) and any break-glass DB edit that sets status directly. Honor
      // an 'active' status as entitled with no expiry; anything else -> Free.
      if (store.subscription_status === 'active') {
        return { plan: store.plan, state: 'active', paidUntil: null, graceEndsAt: null, trialEndsAt: null };
      }
    } else {
      const due   = new Date(store.paid_until);
      const grace = new Date(due.getTime() + GRACE_DAYS * 86400000);
      if (now <= due)   return { plan: store.plan, state: 'active', paidUntil: due, graceEndsAt: grace, trialEndsAt: null };
      if (now <= grace) return { plan: store.plan, state: 'grace',  paidUntil: due, graceEndsAt: grace, trialEndsAt: null };
    }
  }

  return { plan: 'free', state: 'free', paidUntil: null, graceEndsAt: null, trialEndsAt };
}

// Effective plan string only — kept for backwards compatibility with
// tenant.middleware (req.plan) and requireFeature, which expect a bare key.
const effectivePlan = (store) => resolveBilling(store).plan;

// Add one calendar month to a date, anchored to the day-of-month, clamping to the
// target month's last day so Jan-31 + 1mo = Feb-28/29 (not a roll-over into
// March). UTC throughout — all DATETIMEs are stored UTC. Used by the billing
// approval to extend paid_until from the anchor date.
function addOneMonth(date) {
  const d   = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() < day) d.setUTCDate(0);   // overflowed a shorter month -> clamp back
  return d;
}

const planFeatures = (p) => (PLANS[p] || PLANS.free).features;

function hasFeature(plan, role, feature) {
  const planHas = planFeatures(plan).includes(feature);
  return role === 'cashier' ? (planHas && CASHIER_FEATURES.includes(feature)) : planHas;
}

const cashierSeats = (p) => (PLANS[p] || PLANS.free).cashierSeats;

// Build the entitlement snapshot the client caches for UI rendering (nav hiding,
// page guards, FAB/toggle visibility, the billing reminder/promo cards). The
// server still enforces every feature — this is cosmetic. A cashier's features
// are pre-intersected with the role cap here so the client can gate purely off
// the `features` array.
function entitlements(store, role) {
  const b = resolveBilling(store);
  let features = planFeatures(b.plan);
  if (role === 'cashier') features = features.filter(f => CASHIER_FEATURES.includes(f));
  return {
    plan: b.plan,
    features,
    role,
    cashierSeats: cashierSeats(b.plan),
    state: b.state,
    paidUntil: b.paidUntil,
    graceEndsAt: b.graceEndsAt,
    trialEndsAt: b.trialEndsAt,
  };
}

module.exports = {
  PLANS, CASHIER_FEATURES, GRACE_DAYS,
  resolveBilling, effectivePlan, addOneMonth, planFeatures, hasFeature, cashierSeats, entitlements,
};
