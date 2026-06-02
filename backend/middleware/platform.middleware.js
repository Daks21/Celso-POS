// Platform super-admin gate for operator-only endpoints (billing claim review +
// the global GCash QR). Decoupled from tenant auth: it runs AFTER authMiddleware
// (which sets req.user from the JWT) and simply requires role 'superadmin'. The
// super-admin has NO tenant store, so these routes must NOT use loadStore.
//
// Returns 404 (not 403) to everyone else so the operator surface is invisible —
// an unauthorised caller can't even confirm /api/admin/* exists.
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') return res.sendStatus(404);
  next();
}

module.exports = { requireSuperAdmin };
