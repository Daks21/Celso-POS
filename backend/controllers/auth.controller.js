const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { findByEmail, getPreferences, savePreferences, setSessionId } = require('../models/user.model');
const settings   = require('../models/settings.model');
const storeModel = require('../models/store.model');
const { entitlements } = require('../config/plans');
const { validatePassword } = require('../utils/passwordPolicy');
const pool       = require('../config/db.config');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const register = async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;

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
        `INSERT INTO users (full_name, email, password, role, store_id, is_active)
         VALUES (?, ?, ?, 'admin', ?, 1)`,
        [fullName, email, hashedPassword, storeId]
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

    if (currentPassword) {
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?',
      [hashed, req.user.id]
    );
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getPreferencesHandler, savePreferencesHandler, changePassword };
