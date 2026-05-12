const express        = require('express');
const dotenv         = require('dotenv');
const cors           = require('cors');
const productsRouter = require('./routes/products.routes');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Celso POS API is running' });
});

app.use('/api/products', productsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Celso POS server running on port ${PORT}`));
