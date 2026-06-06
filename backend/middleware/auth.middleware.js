const jwt = require('jsonwebtoken');
const { getSessionInfo } = require('../models/user.model');

// Phase 6.7 forced-change gate: while a user is under a pending password reset
// (must_change_password=1), they may reach ONLY the change-password endpoint and the
// identity read — everything else is blocked until they set a new password. Keyed on
// the full original URL so it works regardless of which router invokes authMiddleware.
function isPwChangeExempt(req) {
  const url = (req.originalUrl || '').split('?')[0];
  if (req.method === 'PUT' && url === '/api/auth/password') return true;
  if (req.method === 'GET' && url === '/api/auth/me')       return true;
  return false;
}

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
    // Forced-change gate (Phase 6.7): a temp reset code is in force — only let the
    // change-password + identity calls through; the client redirects on the code.
    if (info.mustChangePassword === 1 && !isPwChangeExempt(req)) {
      return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please set a new password to continue.' });
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
