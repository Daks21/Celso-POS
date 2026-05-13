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

module.exports = { findByEmail, findById, createUser };
