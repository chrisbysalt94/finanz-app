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

  // Investments are now treated as regular deductions (not pre-subtracted)
  const totalInvestments = persons.reduce((sum, p) => sum + (p.invest_amount || 0), 0);

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
      effectiveTotal = Math.round(totalIncome * item.amount_percent / 100 * 100) / 100;
    }

    const splits = {};
    for (const person of persons) {
      if (item.split_type === 'custom' && item.split_custom) {
        const custom = JSON.parse(item.split_custom);
        const pct = custom[person.name] || 0;
        splits[person.name] = Math.round((effectiveTotal * pct / 100) * 100) / 100;
      } else {
        // proportional based on full income (salary + second job)
        const personIncome = person.net_income + (person.second_income || 0);
        const ratio = totalIncome > 0 ? personIncome / totalIncome : 0;
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

  // === Computed Transfers (with breakdown) ===
  const accounts = db.prepare('SELECT * FROM accounts').all();
  const transferMap = {};
  const transferBreakdown = {};
  for (const p of persons) {
    transferMap[p.name] = {};
    transferBreakdown[p.name] = {};
  }

  const unplannedItems = [];
  for (const item of computedItems) {
    if (item.section === 'income') continue;
    const parsed = parseTargetAccount(item.target_account);
    if (!parsed.bank) {
      // Item has no target account — unplanned
      if (item.amount_total > 0) {
        unplannedItems.push({
          category: item.category_name,
          amount_total: item.amount_total,
          splits: item.splits,
        });
      }
      continue;
    }
    // Gehälter kommen direkt auf die eigenen Revolut-Konten — Revolut-Posten
    // brauchen keine Überweisung mehr, sie laufen über die Pocket-Daueraufträge
    if (parsed.bank === 'Revolut') continue;
    // Always use the actual category name so the breakdown shows the real purpose
    const breakdownLabel = item.category_name;
    for (const p of persons) {
      const amount = item.splits[p.name] || 0;
      if (amount <= 0) continue;
      transferMap[p.name][parsed.bank] = (transferMap[p.name][parsed.bank] || 0) + amount;
      if (!transferBreakdown[p.name][parsed.bank]) transferBreakdown[p.name][parsed.bank] = [];
      transferBreakdown[p.name][parsed.bank].push({
        category: breakdownLabel,
        amount: Math.round(amount * 100) / 100,
      });
    }
  }

  // Add investment amounts to TradeRepublic transfers
  for (const p of persons) {
    if ((p.invest_amount || 0) > 0) {
      transferMap[p.name]['TradeRepublic'] = (transferMap[p.name]['TradeRepublic'] || 0) + p.invest_amount;
      if (!transferBreakdown[p.name]['TradeRepublic']) transferBreakdown[p.name]['TradeRepublic'] = [];
      transferBreakdown[p.name]['TradeRepublic'].push({
        category: 'Investition',
        amount: Math.round(p.invest_amount * 100) / 100,
      });
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
        breakdown: (transferBreakdown[p.name][bank] || []).sort((a, b) => a.category.localeCompare(b.category, 'de')),
      });
    }
  }

  // === Computed Standing Orders: pro Person je Pocket ===
  // Gehalt + Spaßgeld bleiben auf dem eigenen Revolut, die Pockets liegen auf
  // dem gemeinsamen Konto — jede Person überweist ihren Anteil pro Pocket selbst.
  const pocketMap = {};
  for (const p of persons) pocketMap[p.name] = {};

  for (const item of computedItems) {
    if (item.section === 'income') continue;
    const parsed = parseTargetAccount(item.target_account);
    if (parsed.bank !== 'Revolut') continue;
    const pocket = parsed.pocket || item.category_name;
    for (const p of persons) {
      const amount = item.splits[p.name] || 0;
      if (amount <= 0) continue;
      if (!pocketMap[p.name][pocket]) {
        pocketMap[p.name][pocket] = { amount: 0, scope: parsed.scope, breakdown: [] };
      }
      pocketMap[p.name][pocket].amount += amount;
      pocketMap[p.name][pocket].breakdown.push({
        category: item.category_name,
        amount: Math.round(amount * 100) / 100,
      });
    }
  }

  // Sparbetrag pro Person: eigenes Sparkonto-Pocket
  for (const p of persons) {
    if ((p.savings_amount || 0) > 0) {
      pocketMap[p.name]['Sparkonto'] = {
        amount: p.savings_amount,
        scope: 'getrennt',
        breakdown: [{ category: `Sparkonto ${p.name}`, amount: Math.round(p.savings_amount * 100) / 100 }],
      };
    }
  }

  const computedStandingOrders = [];
  for (const p of persons) {
    for (const [pocket, data] of Object.entries(pocketMap[p.name])) {
      computedStandingOrders.push({
        person_name: p.name,
        person_id: p.id,
        pocket,
        scope: data.scope,
        amount: Math.round(data.amount * 100) / 100,
        breakdown: data.breakdown.sort((a, b) => a.category.localeCompare(b.category, 'de')),
      });
    }
  }
  computedStandingOrders.sort((a, b) =>
    a.person_id - b.person_id || b.amount - a.amount);

  const jointRevolutIban = accounts.find(a => !a.person_id && a.bank === 'Revolut')?.iban || null;

  res.json({
    persons, totalIncome, totalInvestments,
    categories, items: computedItems, parentSums,
    transfers: computedTransfers, standingOrders: computedStandingOrders,
    jointRevolutIban,
    unplanned: unplannedItems,
  });
});

// Helper: parse target_account like "Zusammen -> Revolut Wohnung", "Getrennt -> Altersvorsorge", or just "Revolut Urlaub"
function parseTargetAccount(target) {
  if (!target) return { scope: 'zusammen', bank: null, pocket: null };
  let dest = target.trim();
  let scope = 'zusammen';

  // Strip "Zusammen -> " or "Getrennt -> " prefix, keep the scope
  const arrowMatch = dest.match(/^(Zusammen|Getrennt)\s*(?:->|→)\s*(.+)$/i);
  if (arrowMatch) {
    scope = arrowMatch[1].toLowerCase();
    dest = arrowMatch[2].trim();
  }

  // Match Spastkonto - personal fun money deductions (no bank transfer needed)
  if (/spast/i.test(dest)) {
    return { scope, bank: null, pocket: null };
  }
  // Match Revolut / Revolute
  if (/^Revolute?\b/i.test(dest)) {
    const pocket = dest.replace(/^Revolute?\s*/i, '').trim() || null;
    return { scope, bank: 'Revolut', pocket };
  }
  // Match TradeRepublic
  if (/^TradeRepublic/i.test(dest)) {
    return { scope, bank: 'TradeRepublic', pocket: null };
  }
  // Match MVB, Barclay or other banks
  if (/MVB|Barclay/i.test(dest)) {
    return { scope, bank: 'Revolut', pocket: dest };
  }
  // For "Getrennt -> Altersvorsorge" etc. - personal/separate items
  if (arrowMatch) {
    return { scope, bank: 'Getrennt', pocket: dest };
  }
  return { scope, bank: null, pocket: null };
}

export default router;
