// JWT verification will be implemented in Module 2.2
const authMiddleware = (req, res, next) => {
  next();
};

module.exports = authMiddleware;
