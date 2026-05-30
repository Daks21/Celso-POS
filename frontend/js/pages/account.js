// Account page data loader
document.addEventListener('DOMContentLoaded', function() {
  const accountPageRoot = document.getElementById('account-page-root');

  if (!accountPageRoot) {
    return; // Not on account page
  }

  const currentUserStr = localStorage.getItem('currentUser');
  if (!currentUserStr) {
    window.location.href = '../index.html';
    return;
  }

  try {
    const currentUser = JSON.parse(currentUserStr);

    // Populate account info
    const fullNameEl = document.getElementById('account-fullname');
    const emailEl = document.getElementById('account-email');
    const emailDisplayEl = document.getElementById('account-email-display');
    const memberSinceEl = document.getElementById('account-member-since');
    const avatarEl = document.getElementById('account-avatar');

    const fullName = currentUser.fullName || 'User';
    const email = currentUser.email || 'No email';

    if (fullNameEl) {
      fullNameEl.textContent = fullName;
    }

    if (emailEl) {
      emailEl.textContent = email;
    }

    if (emailDisplayEl) {
      emailDisplayEl.textContent = email;
    }

    if (memberSinceEl) {
      const createdAt = currentUser.createdAt ? new Date(currentUser.createdAt) : null;
      memberSinceEl.textContent = createdAt && !isNaN(createdAt)
        ? createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: getStoreTz() })
        : '—';
    }

    // ── Preferences DB sync ──
    function syncToDb() {
      syncPreferencesToDb(currentUser.id);
    }

    // ── User-specific prefs blob (read by os.js / ai.js) ──
    function loadUserPrefs() {
      try {
        return JSON.parse(localStorage.getItem('prefs_' + currentUser.id) || '{}');
      } catch (_) { return {}; }
    }
    function saveUserPrefs(p) {
      localStorage.setItem('prefs_' + currentUser.id, JSON.stringify(p));
    }

    // ── Shared: flash "Saved!" on a save button ──
    function flashSaved(btn) {
      var original = btn.dataset.originalLabel || btn.textContent;
      btn.dataset.originalLabel = original;
      btn.textContent = 'Saved!';
      btn.classList.add('is-saved');
      btn.disabled = true;
      setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove('is-saved');
        btn.disabled = false;
      }, 1500);
    }

    // ── Stock Status (auto-saves on change) ──
    const colorOkInput  = document.getElementById('stock-color-ok');
    const colorLowInput = document.getElementById('stock-color-low');
    const colorOutInput = document.getElementById('stock-color-out');
    const swatchOk  = document.getElementById('swatch-ok');
    const swatchLow = document.getElementById('swatch-low');
    const swatchOut = document.getElementById('swatch-out');
    const resetColorsBtn   = document.getElementById('reset-stock-colors');
    const thresholdInput   = document.getElementById('low-stock-threshold');

    if (colorOkInput && colorLowInput && colorOutInput) {

      function loadColorsIntoUI() {
        var colors = getStockColors();
        colorOkInput.value  = colors.ok;
        colorLowInput.value = colors.low;
        colorOutInput.value = colors.out;
        if (swatchOk)  swatchOk.style.backgroundColor  = colors.ok;
        if (swatchLow) swatchLow.style.backgroundColor = colors.low;
        if (swatchOut) swatchOut.style.backgroundColor = colors.out;
        // Apply CSS vars for live preview even before saving
        var root = document.documentElement;
        root.style.setProperty('--stock-color-ok',  colors.ok);
        root.style.setProperty('--stock-color-low', colors.low);
        root.style.setProperty('--stock-color-out', colors.out);
      }

      // Persist all three colors, apply app-wide, sync to DB
      function persistStockColors() {
        localStorage.setItem('stockColors', JSON.stringify({
          ok:  colorOkInput.value,
          low: colorLowInput.value,
          out: colorOutInput.value
        }));
        applyStockColors();
        syncToDb();
      }

      // Live preview on drag — updates swatches + CSS vars, does NOT save yet
      colorOkInput.addEventListener('input', function () {
        if (swatchOk) swatchOk.style.backgroundColor = colorOkInput.value;
        document.documentElement.style.setProperty('--stock-color-ok', colorOkInput.value);
      });
      colorLowInput.addEventListener('input', function () {
        if (swatchLow) swatchLow.style.backgroundColor = colorLowInput.value;
        document.documentElement.style.setProperty('--stock-color-low', colorLowInput.value);
      });
      colorOutInput.addEventListener('input', function () {
        if (swatchOut) swatchOut.style.backgroundColor = colorOutInput.value;
        document.documentElement.style.setProperty('--stock-color-out', colorOutInput.value);
      });

      // Commit the pick once the colour picker closes
      colorOkInput.addEventListener('change', persistStockColors);
      colorLowInput.addEventListener('change', persistStockColors);
      colorOutInput.addEventListener('change', persistStockColors);

      // Reset: revert to defaults — takes effect immediately
      if (resetColorsBtn) {
        resetColorsBtn.addEventListener('click', function () {
          localStorage.removeItem('stockColors');
          loadColorsIntoUI();
          applyStockColors();
          syncToDb();
        });
      }

      // Threshold: clamp and save when the field changes
      if (thresholdInput) {
        thresholdInput.value = getLowStockThreshold();
        thresholdInput.addEventListener('change', function () {
          var val = parseInt(thresholdInput.value, 10);
          if (isNaN(val) || val < 1) val = 1;
          if (val > 9999) val = 9999;
          thresholdInput.value = val;
          localStorage.setItem('lowStockThreshold', String(val));
          syncToDb();
        });
      }

      loadColorsIntoUI();
    }

    // ── Preferences / Tax (auto-saves on change) ──
    const taxToggle        = document.getElementById('tax-feature-toggle');
    const taxDefaultToggle = document.getElementById('tax-default-toggle');
    const taxRateInput     = document.getElementById('tax-rate-input');

    function setTaxSubprefsState(enabled) {
      var subprefs = document.getElementById('tax-subprefs');
      if (!subprefs) return;
      subprefs.style.opacity       = enabled ? '' : '0.45';
      subprefs.style.pointerEvents = enabled ? '' : 'none';
    }

    if (taxToggle) {
      var taxIsOn = localStorage.getItem('taxEnabled') === 'true';
      if (taxIsOn) {
        taxToggle.classList.add('is-on');
        taxToggle.setAttribute('aria-pressed', 'true');
      }
      setTaxSubprefsState(taxIsOn);

      taxToggle.addEventListener('click', function () {
        const isOn = taxToggle.classList.toggle('is-on');
        taxToggle.setAttribute('aria-pressed', String(isOn));
        setTaxSubprefsState(isOn);
        localStorage.setItem('taxEnabled', isOn ? 'true' : 'false');
        syncToDb();
      });
    }

    if (taxDefaultToggle) {
      if (localStorage.getItem('taxDefaultOn') === 'true') {
        taxDefaultToggle.classList.add('is-on');
        taxDefaultToggle.setAttribute('aria-pressed', 'true');
      }
      taxDefaultToggle.addEventListener('click', function () {
        const isOn = taxDefaultToggle.classList.toggle('is-on');
        taxDefaultToggle.setAttribute('aria-pressed', String(isOn));
        localStorage.setItem('taxDefaultOn', isOn ? 'true' : 'false');
        syncToDb();
      });
    }

    // Tax rate — stored as decimal (0.1 = 10%), shown as percentage; saved on change
    if (taxRateInput) {
      var savedRate = parseFloat(localStorage.getItem('taxRate') || '0');
      taxRateInput.value = savedRate > 0 ? parseFloat((savedRate * 100).toFixed(4)) : '';

      taxRateInput.addEventListener('change', function () {
        var pct = parseFloat(taxRateInput.value);
        if (isNaN(pct) || pct < 0) {
          pct = 0;
          taxRateInput.value = '';
        } else if (pct > 100) {
          pct = 100;
          taxRateInput.value = 100;
        }
        localStorage.setItem('taxRate', String(+(pct / 100).toFixed(6)));
        syncToDb();
      });
    }

    // ── Store Info (auto-saves on change) ──
    const storeNameInput    = document.getElementById('store-name-input');
    const storeAddressInput = document.getElementById('store-address-input');

    if (storeNameInput) {
      storeNameInput.value = localStorage.getItem('storeName') || '';
      storeNameInput.addEventListener('change', function () {
        localStorage.setItem('storeName', storeNameInput.value.trim());
        syncToDb();
      });
    }
    if (storeAddressInput) {
      storeAddressInput.value = localStorage.getItem('storeAddress') || '';
      storeAddressInput.addEventListener('change', function () {
        localStorage.setItem('storeAddress', storeAddressInput.value.trim());
        syncToDb();
      });
    }

    // Calculate and display avatar initials
    if (avatarEl) {
      const names = fullName.split(' ');
      let initials = '';

      if (names.length >= 2) {
        initials = (names[0][0] + names[names.length - 1][0]).toUpperCase();
      } else {
        initials = fullName.substring(0, 2).toUpperCase();
      }

      avatarEl.textContent = initials;
    }

    // Reconcile the cached profile with the server. currentUser in
    // localStorage is only a fast first paint; this refreshes the display
    // (and the cache) so a renamed account — or a session that predates the
    // createdAt field — shows correct data without forcing a re-login.
    if (typeof getMe === 'function') {
      getMe().then(function (res) {
        if (!res || !res.success || !res.user) return;
        var u = res.user;
        localStorage.setItem('currentUser', JSON.stringify(Object.assign({}, currentUser, u)));

        var freshName  = u.fullName || fullName;
        var freshEmail = u.email || email;

        if (fullNameEl)     fullNameEl.textContent     = freshName;
        if (emailEl)        emailEl.textContent        = freshEmail;
        if (emailDisplayEl) emailDisplayEl.textContent = freshEmail;

        if (memberSinceEl && u.createdAt) {
          var c = new Date(u.createdAt);
          if (!isNaN(c)) {
            memberSinceEl.textContent = c.toLocaleDateString('en-US',
              { year: 'numeric', month: 'long', day: 'numeric', timeZone: getStoreTz() });
          }
        }

        if (avatarEl) {
          var nm = freshName.trim().split(/\s+/);
          avatarEl.textContent = (nm.length >= 2
            ? (nm[0][0] + nm[nm.length - 1][0])
            : freshName.substring(0, 2)).toUpperCase();
        }
      }).catch(function () { /* offline — cached values remain on screen */ });
    }

    // ── Nav Preferences (Theme & Appearance section) ──
    // getNavPrefs / saveNavPrefs / applyNavPrefs are provided by sidebar.js (loaded first)

    var navPrefs = getNavPrefs();

    // Helper: initialise a pref radio group
    function initRadioGroup(groupId, currentValue, onChange) {
      var group = document.getElementById(groupId);
      if (!group) return;
      var btns = group.querySelectorAll('.pref-radio-btn');
      btns.forEach(function(btn) {
        if (btn.dataset.value === currentValue) btn.classList.add('is-selected');
        btn.addEventListener('click', function() {
          btns.forEach(function(b) { b.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
          onChange(btn.dataset.value);
        });
      });
    }

    // Helper: initialise a pref toggle switch
    function initPrefToggle(id, currentValue, onChange) {
      var toggle = document.getElementById(id);
      if (!toggle) return;
      if (currentValue) {
        toggle.classList.add('is-on');
        toggle.setAttribute('aria-pressed', 'true');
      }
      toggle.addEventListener('click', function() {
        var isOn = toggle.classList.toggle('is-on');
        toggle.setAttribute('aria-pressed', String(isOn));
        onChange(isOn);
      });
    }

    // Nav label — text beside the mobile logo
    initRadioGroup('nav-label-group', navPrefs.navLabel, function(value) {
      var updated = getNavPrefs();
      updated.navLabel = value;
      saveNavPrefs(updated);
      syncToDb();
      var logoLabel = document.querySelector('.mobile-topbar-logo .sidebar-app-name');
      if (logoLabel) {
        if (value === 'page') {
          var h1 = document.querySelector('.topbar h1');
          logoLabel.textContent = h1 ? h1.textContent : 'Celso POS';
        } else {
          logoLabel.textContent = 'Celso POS';
        }
      }
    });

    // Logo tap destination
    initRadioGroup('logo-target-group', navPrefs.logoTarget, function(value) {
      var updated = getNavPrefs();
      updated.logoTarget = value;
      saveNavPrefs(updated);
      syncToDb();
      var logoLink = document.querySelector('.mobile-logo-link');
      if (logoLink) logoLink.href = value;
    });

    // Show theme toggle button
    initPrefToggle('show-theme-btn-toggle', navPrefs.showThemeToggle, function(isOn) {
      var updated = getNavPrefs();
      updated.showThemeToggle = isOn;
      saveNavPrefs(updated);
      syncToDb();
      applyNavPrefs();
    });

    // ── Finance Preferences ──
    initPrefToggle(
      'debt-balance-toggle',
      localStorage.getItem('financeDebtBalanceVisible') !== 'false',
      function(isOn) {
        localStorage.setItem('financeDebtBalanceVisible', String(isOn));
        syncToDb();
      }
    );

    // ── New Order / Payment numpad on desktop (phones & tablets always on) ──
    initPrefToggle(
      'numpad-desktop-toggle',
      localStorage.getItem('numpadOnDesktop') === 'true',  // default OFF
      function(isOn) {
        localStorage.setItem('numpadOnDesktop', String(isOn));
        syncToDb();
      }
    );

    // ── Timezone (store-wide) ──
    var tzSelect    = document.getElementById('timezone-select');
    var tzSaveBtn   = document.getElementById('save-timezone-btn');
    var tzAdminNote = document.getElementById('timezone-admin-note');
    if (tzSelect) {
      var isAdmin = currentUser.role === 'admin';

      var zones = [];
      try {
        if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone');
      } catch (e) {}
      if (!zones.length) {
        zones = ['Asia/Manila','Asia/Singapore','Asia/Hong_Kong','Asia/Tokyo',
                 'Asia/Dubai','Asia/Kolkata','Australia/Sydney','Europe/London',
                 'Europe/Paris','America/New_York','America/Chicago',
                 'America/Los_Angeles','Pacific/Honolulu','UTC'];
      }

      function fillZones(selected) {
        tzSelect.innerHTML = '';
        zones.forEach(function (z) {
          var opt = document.createElement('option');
          opt.value = z; opt.textContent = z;
          if (z === selected) opt.selected = true;
          tzSelect.appendChild(opt);
        });
      }
      fillZones(getStoreTz());

      // Refresh from the server so the selector reflects the live store setting.
      if (typeof getSettings === 'function') {
        getSettings().then(function (res) {
          if (res && res.success && res.data && res.data.timezone) {
            setStoreTz(res.data.timezone);
            fillZones(res.data.timezone);
          }
        }).catch(function () {});
      }

      if (!isAdmin) {
        tzSelect.disabled = true;
        if (tzSaveBtn) tzSaveBtn.disabled = true;
        if (tzAdminNote) tzAdminNote.style.display = '';
      } else if (tzSaveBtn) {
        tzSaveBtn.addEventListener('click', function () {
          var chosen = tzSelect.value;
          tzSaveBtn.disabled = true;
          updateStoreTimezone(chosen).then(function (res) {
            if (res && res.success && res.data) {
              setStoreTz(res.data.timezone);
              flashSaved(tzSaveBtn);
              if (memberSinceEl && currentUser.createdAt) {
                memberSinceEl.textContent = new Date(currentUser.createdAt)
                  .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: getStoreTz() });
              }
            } else {
              tzSaveBtn.disabled = false;
              alert((res && res.message) || 'Could not update timezone.');
            }
          }).catch(function () {
            tzSaveBtn.disabled = false;
            alert('Network error updating timezone.');
          });
        });
      }
    }

    // ── Restart Onboarding ──
    var restartOnboardingBtn = document.getElementById('restart-onboarding-btn');
    if (restartOnboardingBtn) {
      restartOnboardingBtn.addEventListener('click', function () {
        var ok = confirm('Restart the onboarding flow? You\'ll be taken back to the Dashboard and see the welcome modal, setup checklist, and page tours again.');
        if (!ok) return;
        if (typeof OnboardingCore !== 'undefined') {
          OnboardingCore.resetAll(); // resetAll already redirects to dashboard.html
        }
      });
    }

    // ── Dashboard Preferences ──
    initRadioGroup(
      'recent-tx-count-group',
      localStorage.getItem('dashboardRecentCount') || '5',
      function(value) {
        localStorage.setItem('dashboardRecentCount', value);
        syncToDb();
      }
    );

    initRadioGroup(
      'alert-count-group',
      localStorage.getItem('dashboardAlertCount') || '5',
      function(value) {
        localStorage.setItem('dashboardAlertCount', value);
        syncToDb();
      }
    );

    initPrefToggle(
      'items-popover-toggle',
      localStorage.getItem('dashboardItemsPopover') !== 'false',
      function(isOn) {
        localStorage.setItem('dashboardItemsPopover', String(isOn));
        syncToDb();
      }
    );

    // ── Os AI Feature Toggle ──
    var osToggle = document.getElementById('os-enabled-toggle');
    if (osToggle) {
      var prefs = loadUserPrefs();
      osToggle.checked = prefs.osEnabled === true;
      osToggle.addEventListener('change', function () {
        prefs.osEnabled = osToggle.checked;
        saveUserPrefs(prefs);
        syncToDb();
        if (osToggle.checked) {
          if (window.OsFloat) window.OsFloat.mount();
          if (window.DefaultFab) window.DefaultFab.unmount();
        } else {
          if (window.OsFloat) window.OsFloat.unmount();
          if (window.DefaultFab) window.DefaultFab.mount();
        }
      });
    }

    // ── Advanced Analytics Toggle + Monthly Goal ──
    var advToggle = document.getElementById('advanced-analytics-toggle');
    var goalInput = document.getElementById('monthly-goal-input');
    var goalSave  = document.getElementById('monthly-goal-save');
    var goalRow   = document.getElementById('monthly-goal-row');

    if (advToggle) {
      var prefs2 = loadUserPrefs();
      advToggle.checked = prefs2.advancedAnalytics === true;
      if (goalRow) goalRow.style.opacity = advToggle.checked ? '1' : '0.5';
      advToggle.addEventListener('change', function () {
        prefs2.advancedAnalytics = advToggle.checked;
        saveUserPrefs(prefs2);
        syncToDb();
        if (goalRow) goalRow.style.opacity = advToggle.checked ? '1' : '0.5';
      });
    }

    if (goalInput && goalSave) {
      var prefs3 = loadUserPrefs();
      if (prefs3.monthlyRevenueGoal != null && prefs3.monthlyRevenueGoal !== '') {
        goalInput.value = prefs3.monthlyRevenueGoal;
      }
      goalSave.addEventListener('click', function () {
        var p = loadUserPrefs();
        var v = goalInput.value.trim();
        if (v === '') {
          delete p.monthlyRevenueGoal;
        } else {
          var n = parseFloat(v);
          if (isNaN(n) || n < 0) { goalInput.focus(); return; }
          p.monthlyRevenueGoal = n;
        }
        saveUserPrefs(p);
        syncToDb();
        flashSaved(goalSave);
      });
    }

  } catch (e) {
    console.error('Error parsing user data:', e);
    window.location.href = '../index.html';
  }
});
