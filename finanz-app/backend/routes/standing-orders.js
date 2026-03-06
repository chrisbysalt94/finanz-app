import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const orders = db.prepare('SELECT * FROM standing_orders ORDER BY bank, id').all();
  res.json(orders);
});

router.post('/', (req, res) => {
  const { bank, category, amount } = req.body;
  const result = db.prepare(
    'INSERT INTO standing_orders (bank, category, amount) VALUES (?, ?, ?)'
  ).run(bank, category, amount || 0);
  const order = db.prepare('SELECT * FROM standing_orders WHERE id = ?').get(result.lastInsertRowid);
  res.json(order);
});

router.put('/:id', (req, res) => {
  const { bank, category, amount } = req.body;
  db.prepare(`
    UPDATE standing_orders SET
      bank = COALESCE(?, bank),
      category = COALESCE(?, category),
      amount = COALESCE(?, amount)
    WHERE id = ?
  `).run(bank, category, amount, req.params.id);
  const order = db.prepare('SELECT * FROM standing_orders WHERE id = ?').get(req.params.id);
  res.json(order);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM standing_orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
