const express        = require('express');
const dotenv         = require('dotenv');
const cors           = require('cors');
const productsRouter = require('./routes/products.routes');
const authRouter     = require('./routes/auth.routes');
const salesRouter    = require('./routes/sales.routes');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Celso POS API is running' });
});

app.use('/api/auth',     authRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales',    salesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Celso POS server running on port ${PORT}`));
