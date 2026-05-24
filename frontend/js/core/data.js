// ── Shared utilities ──

function formatPeso(amount) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

// ── Stock color defaults ──
var STOCK_COLOR_DEFAULTS = { ok: '#5a9e6f', low: '#eab308', out: '#dc2626' };

function getStockColors() {
  try {
    var saved = localStorage.getItem('stockColors');
    return saved ? JSON.parse(saved) : STOCK_COLOR_DEFAULTS;
  } catch (e) {
    return STOCK_COLOR_DEFAULTS;
  }
}

function applyStockColors() {
  var c = getStockColors();
  var root = document.documentElement;
  root.style.setProperty('--stock-color-ok',  c.ok);
  root.style.setProperty('--stock-color-low', c.low);
  root.style.setProperty('--stock-color-out', c.out);
}

applyStockColors();

// ── Low stock threshold ──
var LOW_STOCK_THRESHOLD_DEFAULT = 50;

function getLowStockThreshold() {
  var saved = parseInt(localStorage.getItem('lowStockThreshold'), 10);
  return isNaN(saved) ? LOW_STOCK_THRESHOLD_DEFAULT : saved;
}

function getStockStatus(stock) {
  var threshold = getLowStockThreshold();
  if (stock === 0)        return { label: 'Out of Stock', cls: 'stock-out', dotCls: 'stock-dot--out', key: 'out' };
  if (stock <= threshold) return { label: 'Low Stock',    cls: 'stock-low', dotCls: 'stock-dot--low', key: 'low' };
  return                         { label: 'In Stock',     cls: 'stock-ok',  dotCls: 'stock-dot--ok',  key: 'ok'  };
}

// ── Preferences sync (DB ↔ localStorage) ──

var PREF_DEFAULTS = {
  theme:                    'light',
  taxEnabled:               false,
  taxRate:                  '0.03',
  taxDefaultOn:             false,
  lowStockThreshold:        50,
  stockColors:              { ok: '#5a9e6f', low: '#eab308', out: '#dc2626' },
  dashboardRecentCount:      5,
  dashboardAlertCount:       5,
  dashboardItemsPopover:     true,
  dashboardWidgets:          [],
  navLabel:                 'app',
  logoTarget:               'order.html',
  showThemeToggle:          false,
  financeDebtBalanceVisible: true,
  osEnabled:                false,
};

function collectCurrentPreferences(userId) {
  var navKey = 'celso_navprefs_' + String(userId);
  var nav = {};
  try { nav = JSON.parse(localStorage.getItem(navKey) || '{}'); } catch (e) {}

  var colors = Object.assign({}, PREF_DEFAULTS.stockColors);
  try { Object.assign(colors, JSON.parse(localStorage.getItem('stockColors') || '{}')); } catch (e) {}

  var widgets = [];
  try { widgets = JSON.parse(localStorage.getItem('dashboardWidgets') || '[]'); } catch (e) {}

  var userPrefs = {};
  try { userPrefs = JSON.parse(localStorage.getItem('prefs_' + String(userId)) || '{}'); } catch (e) {}

  return {
    theme:                localStorage.getItem('theme') || PREF_DEFAULTS.theme,
    taxEnabled:           localStorage.getItem('taxEnabled') === 'true',
    taxRate:              localStorage.getItem('taxRate') || PREF_DEFAULTS.taxRate,
    taxDefaultOn:         localStorage.getItem('taxDefaultOn') === 'true',
    lowStockThreshold:    parseInt(localStorage.getItem('lowStockThreshold') || String(PREF_DEFAULTS.lowStockThreshold), 10),
    stockColors:          colors,
    dashboardRecentCount:  parseInt(localStorage.getItem('dashboardRecentCount')  || String(PREF_DEFAULTS.dashboardRecentCount),  10),
    dashboardAlertCount:   parseInt(localStorage.getItem('dashboardAlertCount')   || String(PREF_DEFAULTS.dashboardAlertCount),   10),
    dashboardItemsPopover:     localStorage.getItem('dashboardItemsPopover') !== 'false',
    dashboardWidgets:          widgets,
    navLabel:                 nav.navLabel        || PREF_DEFAULTS.navLabel,
    logoTarget:               nav.logoTarget       || PREF_DEFAULTS.logoTarget,
    showThemeToggle:          nav.showThemeToggle  === true,
    financeDebtBalanceVisible: localStorage.getItem('financeDebtBalanceVisible') !== 'false',
    osEnabled:                userPrefs.osEnabled === true,
  };
}

function syncPreferencesToDb(userId) {
  var prefs = collectCurrentPreferences(userId);
  savePreferences(prefs).catch(function () {});
}

