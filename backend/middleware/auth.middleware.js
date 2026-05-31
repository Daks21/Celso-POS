const jwt = require('jsonwebtoken');
const { getSessionInfo } = require('../models/user.model');

const authMiddleware = async (req, res, next) => {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = header.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Single active session per account (Phase 6.5, last-login-wins): the token's
  // session id must match the one stored at the user's most recent login. A newer
  // login on another device — or a suspension (is_active=0) — invalidates this
  // token, and the client's 401 handler signs the device out. One indexed PK
  // lookup per authenticated request.
  try {
    const info = await getSessionInfo(payload.id);
    if (!info || info.isActive === 0) {
      return res.status(401).json({ success: false, message: 'Session ended. Please sign in again.' });
    }
    if (!payload.sid || payload.sid !== info.sessionId) {
      return res.status(401).json({ success: false, code: 'SESSION_REPLACED', message: 'Signed in on another device.' });
    }
  } catch (e) {
    return next(e);
  }

  req.user = payload;
  next();
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
