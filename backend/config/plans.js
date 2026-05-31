// Entitlements model — the single source of truth for what each plan unlocks.
// Pure logic, no DB/network: imported by both the server (feature gating in
// tenant.middleware) and mirrored to the client (UI nav hiding). Plans resolve
// from the store's billing state in the DB per request — never from the JWT.

const PLANS = {
  free: {
    label: 'Free', priceUsd: 0, cashierSeats: 0,
    features: ['dashboard_basic', 'order', 'inventory', 'products', 'history'],
  },
  plus: {
    label: 'Plus', priceUsd: 8, cashierSeats: 1, lsVariantEnv: 'LS_VARIANT_PLUS',
    features: ['dashboard_basic', 'dashboard_charts', 'order', 'inventory',
               'products', 'history', 'finance', 'analytics'],
  },
  pro: {
    label: 'Pro', priceUsd: 12, cashierSeats: 2, lsVariantEnv: 'LS_VARIANT_PRO',
    features: ['dashboard_basic', 'dashboard_charts', 'order', 'inventory',
               'products', 'history', 'finance', 'analytics',
               'advanced_analytics', 'ai'],
  },
};

// A cashier's reachable features are capped to this set, then intersected with
// whatever the store's plan unlocks (a cashier on Pro still can't open Finance).
const CASHIER_FEATURES = ['order', 'history'];

// Resolve the plan a store is actually entitled to right now. The no-card Pro
// trial grants 'pro' until trial_ends_at, after which it silently falls to Free
// with no Lemon Squeezy involvement and no dunning.
function effectivePlan(store) {
  if (store.subscription_status === 'active') return store.plan;        // 'plus' | 'pro'
  if (store.subscription_status === 'trialing' && store.trial_ends_at &&
      new Date(store.trial_ends_at) > new Date()) return 'pro';         // no-card trial
  return 'free';
}

const planFeatures = (p) => (PLANS[p] || PLANS.free).features;

function hasFeature(plan, role, feature) {
  const planHas = planFeatures(plan).includes(feature);
  return role === 'cashier' ? (planHas && CASHIER_FEATURES.includes(feature)) : planHas;
}

const cashierSeats = (p) => (PLANS[p] || PLANS.free).cashierSeats;

// Build the entitlement snapshot the client caches for UI rendering (nav hiding,
// page guards, FAB/toggle visibility). The server still enforces every feature —
// this is cosmetic. A cashier's features are pre-intersected with the role cap
// here so the client can gate purely off the `features` array.
function entitlements(store, role) {
  const plan = effectivePlan(store);
  let features = planFeatures(plan);
  if (role === 'cashier') features = features.filter(f => CASHIER_FEATURES.includes(f));
  return {
    plan,
    features,
    role,
    cashierSeats: cashierSeats(plan),
    trialEndsAt: (store && store.trial_ends_at) ? store.trial_ends_at : null,
  };
}

module.exports = { PLANS, CASHIER_FEATURES, effectivePlan, planFeatures, hasFeature, cashierSeats, entitlements };
