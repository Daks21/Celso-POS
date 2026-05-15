const errorMiddleware = (err, req, res, next) => {
  const status = err.status || 500;
  console.error(`[Error] ${req.method} ${req.path} →`, err);
  res.status(status).json({ success: false, message: err.message || 'Internal server error' });
};

module.exports = errorMiddleware;
