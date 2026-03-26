import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const persons = db.prepare('SELECT * FROM persons ORDER BY id').all();
  res.json(persons);
});

router.put('/:id', (req, res) => {
  const { name, net_income, invest_amount, second_income, savings_amount } = req.body;
  db.prepare(`
    UPDATE persons SET
      name = COALESCE(?, name),
      net_income = COALESCE(?, net_income),
      invest_amount = COALESCE(?, invest_amount),
      second_income = COALESCE(?, second_income),
      savings_amount = COALESCE(?, savings_amount)
    WHERE id = ?
  `).run(name, net_income, invest_amount, second_income, savings_amount, req.params.id);
  const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id);
  res.json(person);
});

router.post('/', (req, res) => {
  const { name, net_income } = req.body;
  const result = db.prepare('INSERT INTO persons (name, net_income) VALUES (?, ?)').run(name, net_income || 0);
  const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(result.lastInsertRowid);
  res.json(person);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
