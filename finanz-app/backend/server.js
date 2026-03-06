import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-seed on first run
import './seed.js';

import personsRouter from './routes/persons.js';
import categoriesRouter from './routes/categories.js';
import budgetRouter from './routes/budget.js';
import transfersRouter from './routes/transfers.js';
import standingOrdersRouter from './routes/standing-orders.js';
import accountsRouter from './routes/accounts.js';

const app = express();
const PORT = process.env.PORT || 8099;

app.use(express.json());

// Serve frontend
app.use(express.static(join(__dirname, '..', 'frontend')));

// API routes
app.use('/api/persons', personsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/budget', budgetRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/standing-orders', standingOrdersRouter);
app.use('/api/accounts', accountsRouter);

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(join(__dirname, '..', 'frontend', 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Finanz App running on http://localhost:${PORT}`);
});
