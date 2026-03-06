import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const items = db.prepare(`
    SELECT b.*, c.name as category_name, c.parent_id, c.color, c.section, c.sort_order
    FROM budget_items b
    JOIN categories c ON b.category_id = c.id
    ORDER BY c.section, c.sort_order, c.id
  `).all();
  res.json(items);
});

router.post('/', (req, res) => {
  const { category_id, amount_total, split_type, split_custom, target_account, notes, amount_type, amount_percent } = req.body;
  const result = db.prepare(
    'INSERT INTO budget_items (category_id, amount_total, split_type, split_custom, target_account, notes, amount_type, amount_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(category_id, amount_total || 0, split_type || 'proportional', split_custom || null, target_account || null, notes || null, amount_type || 'fixed', amount_percent ?? null);
  const item = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(result.lastInsertRowid);
  res.json(item);
});

router.put('/:id', (req, res) => {
  const { category_id, amount_total, split_type, split_custom, target_account, notes, amount_type, amount_percent } = req.body;
  db.prepare(`
    UPDATE budget_items SET
      category_id = COALESCE(?, category_id),
      amount_total = COALESCE(?, amount_total),
      split_type = COALESCE(?, split_type),
      split_custom = ?,
      target_account = ?,
      notes = ?,
      amount_type = COALESCE(?, amount_type),
      amount_percent = ?
    WHERE id = ?
  `).run(category_id, amount_total, split_type, split_custom, target_account, notes, amount_type, amount_percent ?? null, req.params.id);
  const item = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(req.params.id);
  res.json(item);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM budget_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Computed: full budget with splits
router.get('/computed', (req, res) => {
  const persons = db.prepare('SELECT * FROM persons ORDER BY id').all();
  // Total income = net salary + second job for each person
  const totalIncome = persons.reduce((sum, p) => sum + p.net_income + (p.second_income || 0), 0);

  // Adjusted income: total salary minus personal investments
  // Proportional splits are based on adjusted income so that
  // a partner who invests more pays less of the shared costs
  const totalInvestments = persons.reduce((sum, p) => sum + (p.invest_amount || 0), 0);
  const adjustedTotal = persons.reduce((sum, p) => sum + (p.net_income + (p.second_income || 0) - (p.invest_amount || 0)), 0);

  const categories = db.prepare('SELECT * FROM categories ORDER BY section, sort_order, id').all();
  const items = db.prepare(`
    SELECT b.*, c.name as category_name, c.parent_id, c.color, c.section, c.sort_order
    FROM budget_items b
    JOIN categories c ON b.category_id = c.id
    ORDER BY c.section, c.sort_order, c.id
  `).all();

  const computedItems = items.map(item => {
    // Resolve effective amount for percent-based items
    let effectiveTotal = item.amount_total;
    if (item.amount_type === 'percent' && item.amount_percent != null) {
      effectiveTotal = Math.round(adjustedTotal * item.amount_percent / 100 * 100) / 100;
    }

    const splits = {};
    for (const person of persons) {
      if (item.split_type === 'custom' && item.split_custom) {
        const custom = JSON.parse(item.split_custom);
        const pct = custom[person.name] || 0;
        splits[person.name] = Math.round((effectiveTotal * pct / 100) * 100) / 100;
      } else {
        // proportional based on adjusted income (salary + second job - investments)
        const adjustedIncome = person.net_income + (person.second_income || 0) - (person.invest_amount || 0);
        const ratio = adjustedTotal > 0 ? adjustedIncome / adjustedTotal : 0;
        splits[person.name] = Math.round((effectiveTotal * ratio) * 100) / 100;
      }
    }
    return { ...item, amount_total: effectiveTotal, splits };
  });

  // Compute parent category sums
  const parentCategories = categories.filter(c => c.parent_id === null);
  const parentSums = {};
  for (const parent of parentCategories) {
    const children = computedItems.filter(i => i.parent_id === parent.id);
    if (children.length > 0) {
      const sum = { amount_total: 0, splits: {} };
      for (const person of persons) {
        sum.splits[person.name] = 0;
      }
      for (const child of children) {
        sum.amount_total += child.amount_total;
        for (const person of persons) {
          sum.splits[person.name] += child.splits[person.name];
        }
      }
      // Round
      sum.amount_total = Math.round(sum.amount_total * 100) / 100;
      for (const person of persons) {
        sum.splits[person.name] = Math.round(sum.splits[person.name] * 100) / 100;
      }
      parentSums[parent.id] = sum;
    }
  }

  // === Computed Transfers ===
  const accounts = db.prepare('SELECT * FROM accounts').all();
  const transferMap = {};
  for (const p of persons) {
    transferMap[p.name] = {};
  }

  for (const item of computedItems) {
    if (item.section === 'income') continue;
    const parsed = parseTargetAccount(item.target_account);
    if (!parsed.bank) continue;
    for (const p of persons) {
      const amount = item.splits[p.name] || 0;
      if (amount <= 0) continue;
      transferMap[p.name][parsed.bank] = (transferMap[p.name][parsed.bank] || 0) + amount;
    }
  }

  // Add investment amounts to TradeRepublic transfers
  for (const p of persons) {
    if ((p.invest_amount || 0) > 0) {
      transferMap[p.name]['TradeRepublic'] = (transferMap[p.name]['TradeRepublic'] || 0) + p.invest_amount;
    }
  }

  const computedTransfers = [];
  for (const p of persons) {
    for (const [bank, amount] of Object.entries(transferMap[p.name])) {
      if (amount <= 0) continue;
      const personalAcc = accounts.find(a => a.person_id === p.id && a.bank === bank);
      const sharedAcc = accounts.find(a => a.person_id === null && a.bank === bank);
      computedTransfers.push({
        person_name: p.name,
        person_id: p.id,
        target_account: bank,
        amount: Math.round(amount * 100) / 100,
        iban: personalAcc?.iban || sharedAcc?.iban || null,
      });
    }
  }

  // === Computed Standing Orders (Revolut pockets) ===
  const pocketTotals = {};
  for (const item of computedItems) {
    if (item.section === 'income') continue;
    const parsed = parseTargetAccount(item.target_account);
    if (!parsed.bank || parsed.bank !== 'Revolut') continue;
    const pocket = parsed.pocket || item.category_name;

    if (parsed.type === 'getrennt') {
      for (const p of persons) {
        const amount = item.splits[p.name] || 0;
        if (amount <= 0) continue;
        const key = `${pocket} ${p.name}`;
        pocketTotals[key] = (pocketTotals[key] || 0) + amount;
      }
    } else {
      pocketTotals[pocket] = (pocketTotals[pocket] || 0) + item.amount_total;
    }
  }

  const computedStandingOrders = Object.entries(pocketTotals).map(([category, amount]) => ({
    bank: 'Revolut',
    category,
    amount: Math.round(amount * 100) / 100,
  }));

  res.json({
    persons, totalIncome, totalInvestments, adjustedTotal,
    categories, items: computedItems, parentSums,
    transfers: computedTransfers, standingOrders: computedStandingOrders,
  });
});

// Helper: parse target_account like "Zusammen -> Revolut Wohnung"
function parseTargetAccount(target) {
  if (!target) return { bank: null, pocket: null, type: null };
  const match = target.match(/^(Zusammen|Getrennt)\s*->\s*(.+)$/i);
  if (!match) return { bank: null, pocket: null, type: null };
  const type = match[1].toLowerCase();
  const dest = match[2].trim();

  if (/^Revolute?\b/i.test(dest)) {
    const pocket = dest.replace(/^Revolute?\s*/i, '').trim() || null;
    return { bank: 'Revolut', pocket, type };
  }
  if (/^TradeRepublic/i.test(dest)) {
    return { bank: 'TradeRepublic', pocket: null, type };
  }
  if (/^MVB/i.test(dest)) {
    return { bank: 'MVB', pocket: null, type };
  }
  return { bank: dest, pocket: null, type };
}

export default router;
