const db = require('../config/db.config');

const findByEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS fullName, email, password, role,
            store_id AS storeId, is_active AS isActive,
            must_change_password AS mustChangePassword, created_at AS createdAt
       FROM users WHERE email = ?`,
    [email]
  );
  return rows[0] || null;
};

const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT id, full_name AS fullName, email, role, store_id AS storeId,
            is_active AS isActive, must_change_password AS mustChangePassword,
            created_at AS createdAt
       FROM users WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
};

// Create a user scoped to a store. storeId is required (every user belongs to a
// store). Used by the Team page (cashiers) and any non-transactional creation;
// owner-admin signup creates its store + user together in auth.controller.
const createUser = async ({ fullName, email, password, role = 'cashier',
                            storeId, mustChangePassword = 0 }) => {
  const [result] = await db.query(
    `INSERT INTO users (full_name, email, password, role, store_id, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [fullName, email, password, role, storeId, mustChangePassword ? 1 : 0]
  );
  return findById(result.insertId);
};

// Total account count. Used at registration to detect the very first account
// (the store owner), who is auto-promoted to admin.
const countUsers = async () => {
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM users');
  return rows[0].count;
};

const getPreferences = async (userId) => {
  const [rows] = await db.query(
    'SELECT preferences FROM users WHERE id = ?',
    [userId]
  );
  if (!rows[0] || !rows[0].preferences) return {};
  const raw = rows[0].preferences;
  try {
    return typeof raw === 'object' ? raw : JSON.parse(raw);
  } catch {
    return {};
  }
};

const savePreferences = async (userId, prefs) => {
  await db.query(
    'UPDATE users SET preferences = ? WHERE id = ?',
    [JSON.stringify(prefs), userId]
  );
};

module.exports = { findByEmail, findById, createUser, countUsers, getPreferences, savePreferences };
