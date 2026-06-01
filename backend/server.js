const dotenv           = require('dotenv');
dotenv.config();

// --- Fail-fast: validate required environment variables ---
const REQUIRED_ENV = [
  'JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS',
  'DB_NAME', 'GROQ_API_KEY'
];
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
const financeRouter    = require('./routes/finance.routes');
const aiRouter         = require('./routes/ai.routes');
const settingsRouter   = require('./routes/settings.routes');
const billingRouter    = require('./routes/billing.routes');
const billingController = require('./controllers/billing.controller');
const teamRouter       = require('./routes/team.routes');
const errorMiddleware  = require('./middleware/error.middleware');
const pool             = require('./config/db.config');
const settings         = require('./models/settings.model');
const tz               = require('./utils/tz');
const path             = require('path');
const fs               = require('fs');

const app = express();

// --- Security headers (OWASP baseline) ---
// The backend serves the frontend on the same origin (see below), so helmet's
// CSP now applies to the pages. Those pages ship two inline <script> blocks
// (the pre-paint theme applier and lucide.createIcons), which helmet's default
// script-src 'self' would block. We relax script-src to allow inline scripts
// and otherwise keep helmet's strict defaults: all third-party libs are
// self-hosted (no CDN), the API is same-origin (connect-src 'self'), inline
// styles are already permitted by the default style-src, and script-src-attr
// stays 'none' (no inline event handlers in the markup). The remaining
// concession is inline-script execution; the app's primary XSS guard is still
// escaping user content on render (textContent). A later hardening pass can move
// the two inline scripts into files + nonces and drop 'unsafe-inline'.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'unsafe-inline'"],
    },
  },
}));

// --- CORS: restrict to known frontend origins ---
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin (same-origin navigations, curl) and any
    // allow-listed cross-origin caller. For anything else, DON'T throw — a
    // thrown error here surfaces as a 500. Instead withhold the CORS headers
    // (cb(null, false)): same-origin requests don't need them and still
    // succeed, while a genuinely cross-origin disallowed caller is blocked by
    // the browser. This matters now that the backend serves the frontend on
    // one origin: the page's own fetch() calls and @font-face loads send an
    // Origin header (e.g. http://localhost:3000) that isn't in the allowlist,
    // and the old throw turned every one of them into a 500.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// --- Request logging ---
app.use(morgan('dev'));

// --- Lemon Squeezy webhook (raw body for HMAC) — MUST be before express.json ---
// LS posts subscription events here; authenticity is the X-Signature HMAC over
// the raw request bytes, so this one route takes the raw Buffer and bypasses the
// JSON body parser below. (Phase 6.5 §6.3.)
app.post('/api/billing/webhook',
  express.raw({ type: 'application/json' }), billingController.webhook);

// --- Body parser with size limit (DoS protection) ---
app.use(express.json({ limit: '10kb' }));

// --- Rate limiting on auth endpoints ---
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// --- Rate limiting on stock adjustment write endpoint only ---
const adjustLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
app.use('/api/inventory/:productId/adjust', adjustLimiter);

// --- Health check ---
app.get('/api/health', async (req, res) => {
  try {
    // Connectivity probe only. SELECT 1 confirms the pool is alive without
    // exposing any cross-tenant data (the old product COUNT leaked a global
    // figure to an unauthenticated caller).
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'Celso POS API is running',
      db: 'Connected',
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
app.use('/api/finance',   financeRouter);
app.use('/api/ai',        aiRouter);
app.use('/api/settings',  settingsRouter);
app.use('/api/billing',   billingRouter);
app.use('/api/team',      teamRouter);

// --- Unknown API route → JSON 404 (don't fall through to the static layer) ---
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

// --- Serve the frontend from this same origin (single-origin deploy) ---
// frontend/js/core/api.js derives its API base from window.location.origin +
// '/api', so the page and the API must share one origin. Fail loudly on boot if
// the frontend is missing (e.g. the service was deployed with the wrong root
// directory) instead of silently 404-ing every page. See README Phase 7.1.
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
if (!fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
  console.error(`[Startup] Frontend not found at ${FRONTEND_DIR} — deploy the ` +
    `whole repo so the backend can serve the frontend (see README Phase 7.1).`);
  process.exit(1);
}
app.use(express.static(FRONTEND_DIR));

// --- Non-API GET that matched no static file → land on the login page ---
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// --- Global error handler ---
app.use(errorMiddleware);

// --- Start server ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  console.log(`[Server] Celso POS running on port ${PORT}`);
  // Load the store timezone into cache and learn whether MySQL can resolve
  // named IANA zones (else CONVERT_TZ falls back to a fixed offset).
  await settings.load();
  const named = await tz.detectNamedZones();
  console.log(`[TZ] Store timezone: ${settings.getTimezone()} | ` +
    `MySQL named zones: ${named ? 'available' : 'offset fallback'}`);
});

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
