const dotenv           = require('dotenv');
dotenv.config();

const express          = require('express');
const cors             = require('cors');
const productsRouter   = require('./routes/products.routes');
const authRouter       = require('./routes/auth.routes');
const salesRouter      = require('./routes/sales.routes');
const analyticsRouter  = require('./routes/analytics.routes');
const inventoryRouter  = require('./routes/inventory.routes');
const rateLimit        = require('express-rate-limit');
const errorMiddleware  = require('./middleware/error.middleware');

require('./config/db.config');

const app = express();

app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

app.get('/api/health', async (req, res) => {
  try {
    const db = require('./config/db.config');
    const [rows] = await db.query('SELECT COUNT(*) AS count FROM products');
    res.json({
      success: true,
      message: 'Celso POS API is running',
      db: `Connected — ${rows[0].count} products in database`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use('/api/auth',      authRouter);
app.use('/api/products',  productsRouter);
app.use('/api/sales',     salesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/inventory', inventoryRouter);

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Celso POS server running on port ${PORT}`));
