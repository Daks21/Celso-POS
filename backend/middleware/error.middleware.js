const errorMiddleware = (err, req, res, next) => {
  const status = err.status || 500;
  // Full detail stays server-side. Deliberate 4xx errors (those that set a
  // status) carry safe, user-facing messages; 5xx errors are masked so raw
  // driver/SQL/internal text is never disclosed to the client.
  console.error(`[Error] ${req.method} ${req.path} →`, err);
  const message = status >= 500
    ? 'Internal server error'
    : (err.message || 'Request failed');
  res.status(status).json({ success: false, message });
};

module.exports = errorMiddleware;
