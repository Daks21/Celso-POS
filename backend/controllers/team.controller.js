// backend/controllers/team.controller.js
//
// Team management (Phase 6.5 §7). The owner-admin creates/suspends cashier
// sub-accounts for their store. All routes are admin-only and store-scoped; new
// cashiers are forced to change their temp password on first login. Seat count
// is capped by the store's plan (Free 0 / Plus 1 / Pro 2).

const bcrypt = require('bcrypt');
const pool   = require('../config/db.config');
const { findByEmail, createUser, countActiveCashiers } = require('../models/user.model');
const { cashierSeats } = require('../config/plans');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/team — cashiers in this store + seat usage.
const list = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS fullName, email, is_active AS isActive,
              must_change_password AS mustChangePassword, created_at AS createdAt
       FROM users
       WHERE store_id = ? AND role = 'cashier'
       ORDER BY created_at ASC, id ASC`,
      [req.user.storeId]
    );
    const seatsUsed = await countActiveCashiers(req.user.storeId);
    res.json({
      success: true,
      data: rows,
      seatsUsed,
      seatsTotal: cashierSeats(req.plan),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/team — create a cashier (forced password change on first login).
const create = async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and a temporary password are required' });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Temporary password must be at least 8 characters' });
    }

    // Seat gate — plan caps active cashiers (Free 0 / Plus 1 / Pro 2).
    const used  = await countActiveCashiers(req.user.storeId);
    const total = cashierSeats(req.plan);
    if (used >= total) {
      return res.status(402).json({
        success: false, code: 'SEAT_LIMIT',
        message: total === 0
          ? 'Cashier accounts need a Plus or Pro plan.'
          : `Your plan allows ${total} cashier${total === 1 ? '' : 's'}. Upgrade to add more.`,
      });
    }

    // Email is globally unique (login is global).
    if (await findByEmail(email)) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await createUser({
      fullName, email, password: hashed, role: 'cashier',
      storeId: req.user.storeId, mustChangePassword: 1,
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id, fullName: user.fullName, email: user.email,
        isActive: 1, mustChangePassword: 1, createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Fetch a cashier that belongs to this store (or null).
async function _storeCashier(storeId, id) {
  const [rows] = await pool.query(
    "SELECT id, is_active FROM users WHERE id = ? AND store_id = ? AND role = 'cashier'",
    [id, storeId]
  );
  return rows[0] || null;
}

// PATCH /api/team/:id/active — activate / deactivate. Reactivation respects seats.
const setActive = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid user ID' });

    const active = req.body.active === true || req.body.active === 1 || req.body.active === 'true';

    const cashier = await _storeCashier(req.user.storeId, id);
    if (!cashier) return res.status(404).json({ success: false, message: 'Cashier not found' });

    if (active && cashier.is_active === 0) {
      const used  = await countActiveCashiers(req.user.storeId);
      if (used >= cashierSeats(req.plan)) {
        return res.status(402).json({
          success: false, code: 'SEAT_LIMIT',
          message: 'No free seats on your plan. Upgrade or deactivate another cashier first.',
        });
      }
    }

    await pool.query(
      "UPDATE users SET is_active = ? WHERE id = ? AND store_id = ? AND role = 'cashier'",
      [active ? 1 : 0, id, req.user.storeId]
    );
    res.json({ success: true, data: { id, isActive: active ? 1 : 0 } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/team/:id — soft delete (is_active = 0; row + sale history kept).
const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid user ID' });

    const [result] = await pool.query(
      "UPDATE users SET is_active = 0 WHERE id = ? AND store_id = ? AND role = 'cashier'",
      [id, req.user.storeId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Cashier not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, setActive, remove };
