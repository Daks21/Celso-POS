const dotenv           = require('dotenv');
dotenv.config();

// --- Fail-fast: validate required environment variables ---
const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) {
    console.error(`[Startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const express          = require('express');
const cors             = require('cors');
const helmet           = require('helmet');
const morgan           = require('morgan');
const rateLimit        = require('express-rate-limit');
const productsRouter   = require('./routes/products.routes');
const authRouter       = require('./routes/auth.routes');
const salesRouter      = require('./routes/sales.routes');
const analyticsRouter  = require('./routes/analytics.routes');
const inventoryRouter  = require('./routes/inventory.routes');
const errorMiddleware  = require('./middleware/error.middleware');
const pool             = require('./config/db.config');

const app = express();

// --- Security headers (OWASP baseline) ---
app.use(helmet());

// --- CORS: restrict to known frontend origin ---
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// --- Request logging ---
app.use(morgan('dev'));

// --- Body parser with size limit (DoS protection) ---
app.use(express.json({ limit: '10kb' }));

// --- Rate limiting on auth endpoints ---
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// --- Rate limiting on admin write endpoint ---
const adjustLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
app.use('/api/inventory', adjustLimiter);

// --- Health check ---
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM products');
    res.json({
      success: true,
      message: 'Celso POS API is running',
      db: `Connected — ${rows[0].count} products in database`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Routes ---
app.use('/api/auth',      authRouter);
app.use('/api/products',  productsRouter);
app.use('/api/sales',     salesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/inventory', inventoryRouter);

// --- Global error handler ---
app.use(errorMiddleware);

// --- Start server ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`[Server] Celso POS running on port ${PORT}`)
);

// --- Graceful shutdown ---
const shutdown = async (signal) => {
  console.log(`[Server] ${signal} received — shutting down gracefully`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[DB] Connection pool closed');
    } catch (err) {
      console.error('[DB] Error closing pool:', err.message);
    }
    process.exit(0);
  });
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
