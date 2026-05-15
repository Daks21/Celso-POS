const errorMiddleware = (err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ success: false, message: err.message || 'Internal server error' });
};

module.exports = errorMiddleware;
