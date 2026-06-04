// core/lite-mode.js — "Lite Mode" for low-end devices and slow links.
//
// Strips animations, transitions, shadows, and blur (via the html.lite-mode
// CSS block in main.css) and tells the charts to stay as lightweight tables
// instead of loading Chart.js. Our target users run budget Android phones on
// throttled data, so this is a first-class setting, not an afterthought.
//
// Runs as a NON-deferred <head> script so html.lite-mode is set BEFORE first
// paint — no flash of the heavy UI. The preference is DEVICE-LOCAL
// (localStorage), not a synced account setting: the same owner may want Lite
// on a cheap phone but Off on a desktop.
(function () {
  'use strict';

  var KEY = 'liteMode';            // 'auto' | 'on' | 'off'   (default: 'auto')

  function pref() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (_) { return 'auto'; }
  }

  // Hidden escape hatch (no UI): ?lite=on|off|auto forces the mode and STICKS
  // (persisted), so QA/support — or a rare power user — can override the
  // auto-detection on a device the heuristic gets wrong. There is intentionally
  // no Settings toggle: our non-technical users won't find one, and the device
  // that needs Lite gets it automatically.
  function applyUrlOverride() {
    try {
      var m = /[?&]lite=(on|off|auto)\b/i.exec(window.location.search);
      if (m) localStorage.setItem(KEY, m[1].toLowerCase());
    } catch (_) {}
  }

  // Auto-detect a constrained device / connection. Any one signal is enough.
  function detect() {
    try {
      var n = navigator || {};
      var c = n.connection || {};
      if (c.saveData === true) return true;                              // data-saver
      if (typeof n.deviceMemory === 'number' && n.deviceMemory <= 2) return true;
      if (typeof n.hardwareConcurrency === 'number' && n.hardwareConcurrency <= 2) return true;
      if (window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (_) {}
    return false;
  }

  // Resolve the effective on/off from a stored preference ('auto' → detect()).
  function resolve(p) {
    p = p || pref();
    if (p === 'on')  return true;
    if (p === 'off') return false;
    return detect();
  }

  function apply(active) {
    var el = document.documentElement;
    if (active) el.classList.add('lite-mode');
    else        el.classList.remove('lite-mode');
  }

  // Apply now — we're in <head>, before <body> renders.
  applyUrlOverride();
  apply(resolve());

  window.LiteMode = {
    isActive: function () {
      return document.documentElement.classList.contains('lite-mode');
    },
    get:    pref,        // the stored preference ('auto' | 'on' | 'off')
    detect: detect,      // what 'auto' currently resolves to
    set: function (value) {
      try { localStorage.setItem(KEY, value); } catch (_) {}
      apply(resolve(value));
    }
  };
})();
