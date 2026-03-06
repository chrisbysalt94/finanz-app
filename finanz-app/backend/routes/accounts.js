import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT a.*, p.name as person_name FROM accounts a LEFT JOIN persons p ON a.person_id = p.id ORDER BY a.bank, a.person_id').all();
  res.json(accounts);
});

router.post('/', (req, res) => {
  const { person_id, bank, iban } = req.body;
  const result = db.prepare(
    'INSERT INTO accounts (person_id, bank, iban) VALUES (?, ?, ?)'
  ).run(person_id || null, bank, iban || null);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.json(account);
});

router.put('/:id', (req, res) => {
  const { person_id, bank, iban } = req.body;
  db.prepare(`
    UPDATE accounts SET
      person_id = ?,
      bank = COALESCE(?, bank),
      iban = ?
    WHERE id = ?
  `).run(person_id, bank, iban, req.params.id);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  res.json(account);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
