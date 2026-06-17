import express from 'express';
import cors from 'cors';
import { ensureDefaults, closeDb } from './sqlite.js';
import productsRouter from './routes/products-sqlite.js';
import sourcingRouter from './routes/sourcing-sqlite.js';
import listingsRouter from './routes/listings-sqlite.js';
import settingsRouter from './routes/settings-sqlite.js';
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json({ limit: '10mb' }));
ensureDefaults();
app.use('/api/products', productsRouter);
app.use('/api/sourcing', sourcingRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/settings', settingsRouter);
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});
// Graceful shutdown
process.on('SIGINT', () => { closeDb(); process.exit(); });
process.on('SIGTERM', () => { closeDb(); process.exit(); });
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map