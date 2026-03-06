import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const transfers = db.prepare('SELECT t.*, p.name as person_name FROM transfers t JOIN persons p ON t.person_id = p.id ORDER BY p.id, t.id').all();
  res.json(transfers);
});

router.post('/', (req, res) => {
  const { person_id, target_account, amount, iban } = req.body;
  const result = db.prepare(
    'INSERT INTO transfers (person_id, target_account, amount, iban) VALUES (?, ?, ?, ?)'
  ).run(person_id, target_account, amount || 0, iban || null);
  const transfer = db.prepare('SELECT t.*, p.name as person_name FROM transfers t JOIN persons p ON t.person_id = p.id WHERE t.id = ?').get(result.lastInsertRowid);
  res.json(transfer);
});

router.put('/:id', (req, res) => {
  const { person_id, target_account, amount, iban } = req.body;
  db.prepare(`
    UPDATE transfers SET
      person_id = COALESCE(?, person_id),
      target_account = COALESCE(?, target_account),
      amount = COALESCE(?, amount),
      iban = ?
    WHERE id = ?
  `).run(person_id, target_account, amount, iban, req.params.id);
  const transfer = db.prepare('SELECT t.*, p.name as person_name FROM transfers t JOIN persons p ON t.person_id = p.id WHERE t.id = ?').get(req.params.id);
  res.json(transfer);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transfers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
