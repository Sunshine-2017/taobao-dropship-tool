import express from 'express';
import cors from 'cors';
import { initDefaults } from './db.js';
import productsRouter from './routes/products.js';
import sourcingRouter from './routes/sourcing.js';
import listingsRouter from './routes/listings.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Init database defaults
initDefaults();

// Routes
app.use('/api/products', productsRouter);
app.use('/api/sourcing', sourcingRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/settings', settingsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
