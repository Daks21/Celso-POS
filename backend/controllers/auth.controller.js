const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { findByEmail, findByEmailForRecovery, getPreferences, savePreferences,
        setSessionId, setPassword, setRecoveryInfo } = require('../models/user.model');
const resetRequest = require('../models/resetRequest.model');
const settings   = require('../models/settings.model');
const storeModel = require('../models/store.model');
const { entitlements } = require('../config/plans');
const { validatePassword } = require('../utils/passwordPolicy');
const { hashAnswer, compareAnswer, normalizePhMobile } = require('../utils/securityAnswer');
const pool       = require('../config/db.config');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phase 6.7 recovery tuning.
const MAX_RESET_REQUESTS_PER_DAY = 3;
// A real bcrypt hash compared against on a no-match path, so a request for an
// unknown / non-owner email costs ~the same time as a genuine one (anti-enumeration
// via uniform timing). Computed once at boot.
const DUMMY_ANSWER_HASH = bcrypt.hashSync('celso-pos-dummy-answer', 10);
const GENERIC_FORGOT_MSG =
  "If that account exists, we'll contact your registered mobile number. Please allow up to 24 hours.";

const register = async (req, res, next) => {
  try {
    const { fullName, email, password, mobile, securityAnswer } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    // Phase 6.7 recovery details — REQUIRED for owner signups (register is the
    // owner-only signup path). Mobile is canonicalized to 09XXXXXXXXX; the security
    // answer (place of birth) is bcrypt-hashed, never stored in clear.
    if (!mobile || String(mobile).trim() === '') {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }
    const mobileNorm = normalizePhMobile(mobile);
    if (!mobileNorm) {
      return res.status(400).json({ success: false, message: 'Enter a valid mobile number (e.g. 09171234567)' });
    }
    if (!securityAnswer || String(securityAnswer).trim() === '') {
      return res.status(400).json({ success: false, message: 'Place of birth is required' });
    }
    const answerHash = await hashAnswer(securityAnswer);

    if (await findByEmail(email)) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Phase 6.5: every signup creates its OWN isolated store, and the signer is
    // that store's owner-admin (this replaces the single-tenant "first account
    // is admin" rule). The store starts on a 14-day, no-card BASIC trial; on
    // expiry effectivePlan() drops it to Free with zero billing involvement.
    // Store row, owner user, and the owner back-link are written in one
    // transaction so a half-created store can never exist.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [store] = await conn.query(
        `INSERT INTO stores (subscription_status, trial_ends_at)
         VALUES ('trialing', DATE_ADD(NOW(), INTERVAL 14 DAY))`
      );
      const storeId = store.insertId;
      const [user] = await conn.query(
        `INSERT INTO users (full_name, email, password, role, store_id, is_active, mobile, security_answer_hash)
         VALUES (?, ?, ?, 'admin', ?, 1, ?, ?)`,
        [fullName, email, hashedPassword, storeId, mobileNorm, answerHash]
      );
      await conn.query(
        `UPDATE stores SET owner_user_id = ? WHERE id = ?`,
        [user.insertId, storeId]
      );
      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      // A race past the pre-check still hits the UNIQUE(email) constraint.
      if (txErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'Email is already registered' });
      }
      throw txErr;
    } finally {
      conn.release();
    }

    return res.status(201).json({ success: true, message: 'Account created successfully' });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const user = await findByEmail(email);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Suspended accounts (e.g. cashiers freed up by a downgrade) keep their row
    // and history but cannot obtain a token until reactivated by the owner.
    if (user.isActive === 0) {
      return res.status(403).json({ success: false, message: 'Account suspended — ask your store owner.' });
    }

    // Phase 6.7: if a temp reset code is in force (must_change_password=1), refuse a
    // code that has expired so a stale, texted-out code can't be used — the owner
    // must submit a fresh request. (Within the window, login proceeds and the
    // response flags mustChangePassword so the client routes to the change screen.)
    if (user.mustChangePassword === 1 && user.pwResetExpiresAt &&
        new Date(user.pwResetExpiresAt).getTime() < Date.now()) {
      // 403 (not 401) on purpose: the client's apiCall auto-redirects on 401, which
      // would swallow this message on the login page. 403 lets the login form show it.
      return res.status(403).json({
        success: false, code: 'RESET_EXPIRED',
        message: 'Your reset code has expired. Please submit a new password reset request.',
      });
    }

    // Single active session (last-login-wins): mint a fresh session id, store it
    // on the user, and sign it into the token. Any token from a prior device now
    // mismatches the stored id and is rejected by authMiddleware on its next call.
    const sessionId = crypto.randomBytes(16).toString('hex');
    await setSessionId(user.id, sessionId);

    const token = jwt.sign(
      { id: user.id, fullName: user.fullName, email: user.email, role: user.role, storeId: user.storeId, sid: sessionId },
      process.env.JWT_SECRET,
      // Short-lived by default: store devices are shared, so a long-lived token
      // left signed in is a risk. Tunable per-deployment via JWT_EXPIRES_IN.
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    // Return THIS store's timezone so the client renders dates in store-local
    // time without an extra call (falls back to the global default only if the
    // store row is somehow missing).
    const store = await storeModel.findById(user.storeId);

    // Entitlements snapshot for the client (UI rendering only — server enforces).
    const ent = store
      ? entitlements(store, user.role)
      : { plan: 'free', features: [], role: user.role, cashierSeats: 0, trialEndsAt: null };

    return res.status(200).json({
      success: true,
      token,
      // Phase 6.7: tells the client to route to the forced password-change screen
      // before the app (set after an operator-approved reset). false in the normal case.
      mustChangePassword: user.mustChangePassword === 1,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, createdAt: user.createdAt },
      timezone: store ? store.timezone : settings.getTimezone(),
      // Store identity (printed on receipts, drives the sidebar brand). Sourced
      // from the store row so every user of the store — owner AND cashiers —
      // shares one identity, instead of the old per-user preferences value.
      storeName:    store ? (store.name || '') : '',
      storeAddress: store ? (store.address || '') : '',
      ...ent
    });
  } catch (err) {
    next(err);
  }
};

const getPreferencesHandler = async (req, res, next) => {
  try {
    const prefs = await getPreferences(req.user.id);
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
};

const savePreferencesHandler = async (req, res, next) => {
  try {
    await savePreferences(req.user.id, req.body);
    res.json({ success: true, data: req.body });
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/password — owner self-service password change. Admin-gated at the
// route, so a cashier token can't reach it (cashier credentials are reset by the
// owner on the Team page). currentPassword is verified when supplied.
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    const user = await findByEmail(req.user.email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Re-auth for a NORMAL self-service change. The forced post-reset change
    // (must_change_password=1) is EXEMPT — the temp code the owner just logged in
    // with is the authentication, and they don't know a prior password. This blocks
    // an unattended/stolen owner session from silently changing the password.
    if (user.mustChangePassword !== 1) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Your current password is required.' });
      }
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    // Clears must_change_password + pw_reset_expires_at; current session stays valid
    // (same response contract as before — no token swap, so change-password.js is
    // unaffected). Then advance any linked reset request to 'completed' (no-op if none).
    await setPassword(req.user.id, hashed);
    await resetRequest.markCompletedForUser(req.user.id);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password — PUBLIC (rate-limited). A locked-out OWNER submits
// email + mobile + place-of-birth + free-text history answers. We compute the match
// SCORECARD (storing only booleans, never the raw secrets), dedupe open requests,
// cap per-email/day, and ALWAYS return the same generic message (anti-enumeration).
// Nothing is reset here — the platform super-admin reviews + approves in admin.html.
const forgotPassword = async (req, res, next) => {
  try {
    const { email, mobile, securityAnswer, historyAnswers } = req.body;
    const generic = res.json.bind(res, { success: true, message: GENERIC_FORGOT_MSG });

    // Shape validation (a malformed submission isn't an enumeration vector, so a 400
    // is fine here; a well-formed-but-unknown email still gets the generic 200 below).
    if (!email || !emailRegex.test(String(email)) || !mobile || !securityAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Email, mobile number, and place of birth are required.',
      });
    }

    const normEmail = String(email).trim().toLowerCase();

    // Per-email/day abuse cap — silently drop past the cap (still generic 200).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if ((await resetRequest.countByEmailSince(normEmail, since)) >= MAX_RESET_REQUESTS_PER_DAY) {
      return generic();
    }

    // Dedupe: one OPEN request per email at a time.
    if (await resetRequest.findOpenByEmail(normEmail)) {
      return generic();
    }

    // Compute the scorecard. Recovery is OWNERS-ONLY (role 'admin'); a cashier /
    // unknown email yields all-false + a dummy bcrypt to keep timing uniform.
    let mobileMatch = false, answerMatch = false, userId = null, storeId = null;
    const lookup = await findByEmailForRecovery(normEmail);
    if (lookup && lookup.role === 'admin') {
      userId  = lookup.id;
      storeId = lookup.storeId;
      const onfile    = normalizePhMobile(lookup.mobile);
      const submitted = normalizePhMobile(mobile);
      mobileMatch = !!(onfile && submitted && onfile === submitted);
      // Always spend one bcrypt: a grandfathered owner with a NULL answer hash would
      // otherwise skip it and be distinguishable by response time. Compare against the
      // dummy hash in that case (it never matches) so timing is uniform.
      answerMatch = lookup.securityAnswerHash
        ? await compareAnswer(securityAnswer, lookup.securityAnswerHash)
        : (await compareAnswer(securityAnswer, DUMMY_ANSWER_HASH), false);
    } else {
      await compareAnswer(securityAnswer, DUMMY_ANSWER_HASH); // uniform timing on a miss
    }

    await resetRequest.create({
      email: normEmail,
      submitted_mobile: String(mobile).trim().slice(0, 20),
      mobile_match: mobileMatch,
      answer_match: answerMatch,
      history_answers: historyAnswers ? String(historyAnswers).slice(0, 2000) : null,
      user_id: userId,
      store_id: storeId,
    });

    return generic();
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/recovery — auth + admin. Owner sets/updates their recovery mobile
// and/or security answer (backfill for grandfathered owners; edit on the Account
// page). Only the supplied fields change; the answer is hashed, never stored clear.
const updateRecovery = async (req, res, next) => {
  try {
    const { mobile, securityAnswer, currentPassword } = req.body;
    const fields = {};

    if (mobile !== undefined) {
      const norm = normalizePhMobile(mobile);
      if (!norm) {
        return res.status(400).json({ success: false, message: 'Enter a valid mobile number (e.g. 09171234567)' });
      }
      fields.mobile = norm;
    }
    if (securityAnswer !== undefined) {
      if (!String(securityAnswer).trim()) {
        return res.status(400).json({ success: false, message: 'Place of birth cannot be empty.' });
      }
      fields.securityAnswerHash = await hashAnswer(securityAnswer);
    }
    if (!Object.keys(fields).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    // Step-up: recovery details CONTROL how the account is recovered, so re-verify the
    // owner's current password before changing them — otherwise an unattended/stolen
    // owner session could repoint the recovery mobile and take over the account later.
    if (!currentPassword) {
      return res.status(400).json({ success: false, message: 'Your current password is required.' });
    }
    const user = await findByEmail(req.user.email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    await setRecoveryInfo(req.user.id, fields);
    res.json({ success: true, message: 'Recovery details updated' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, login, getPreferencesHandler, savePreferencesHandler, changePassword,
  forgotPassword, updateRecovery,
};
