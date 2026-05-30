const db = require('../config/db.config');

const findByEmail = async (email) => {
  const [rows] = await db.query(
    'SELECT id, full_name AS fullName, email, password, role, created_at AS createdAt FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
};

const findById = async (id) => {
  const [rows] = await db.query(
    'SELECT id, full_name AS fullName, email, role, created_at AS createdAt FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
};

const createUser = async ({ fullName, email, password, role = 'cashier' }) => {
  const [result] = await db.query(
    'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)',
    [fullName, email, password, role]
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
