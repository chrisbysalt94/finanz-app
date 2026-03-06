import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY section, sort_order, id').all();
  res.json(categories);
});

router.post('/', (req, res) => {
  const { name, parent_id, color, sort_order, section } = req.body;
  const result = db.prepare(
    'INSERT INTO categories (name, parent_id, color, sort_order, section) VALUES (?, ?, ?, ?, ?)'
  ).run(name, parent_id || null, color || '#ffffff', sort_order || 0, section || 'fixed');
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  res.json(cat);
});

router.put('/:id', (req, res) => {
  const { name, parent_id, color, sort_order, section } = req.body;
  db.prepare(`
    UPDATE categories SET
      name = COALESCE(?, name),
      parent_id = COALESCE(?, parent_id),
      color = COALESCE(?, color),
      sort_order = COALESCE(?, sort_order),
      section = COALESCE(?, section)
    WHERE id = ?
  `).run(name, parent_id, color, sort_order, section, req.params.id);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  res.json(cat);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
