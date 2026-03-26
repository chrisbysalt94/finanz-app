import db from './db.js';

// Only seed if DB is empty
const count = db.prepare('SELECT COUNT(*) as c FROM persons').get().c;
if (count > 0) {
  console.log('Database already seeded, skipping.');
} else {

console.log('Seeding database with example data...');

const insertPerson = db.prepare('INSERT INTO persons (name, net_income) VALUES (?, ?)');
const insertCategory = db.prepare('INSERT INTO categories (name, parent_id, color, sort_order, section) VALUES (?, ?, ?, ?, ?)');
const insertBudgetItem = db.prepare('INSERT INTO budget_items (category_id, amount_total, split_type, split_custom, target_account, notes) VALUES (?, ?, ?, ?, ?, ?)');
const insertAccount = db.prepare('INSERT INTO accounts (person_id, bank, iban) VALUES (?, ?, ?)');

const seedAll = db.transaction(() => {
  // === PERSONS (example data — customize in the app!) ===
  insertPerson.run('Person 1', 3000.00);
  insertPerson.run('Person 2', 2500.00);
  // Set invest_amount and savings_amount per person
  db.prepare('UPDATE persons SET invest_amount = ?, savings_amount = ? WHERE name = ?').run(500, 100, 'Person 1');
  db.prepare('UPDATE persons SET invest_amount = ?, savings_amount = ? WHERE name = ?').run(300, 50, 'Person 2');

  // === CATEGORIES & BUDGET ITEMS ===

  // --- INCOME (section: income, color: blue) ---
  const income = insertCategory.run('Einkommen', null, '#4a90d9', 0, 'income').lastInsertRowid;

  const gehaltHaupt = insertCategory.run('Gehalt Hauptjob', income, '#4a90d9', 1, 'income').lastInsertRowid;
  insertBudgetItem.run(gehaltHaupt, 5500.00, 'custom', '{"Person 1":54.55,"Person 2":45.45}', null, 'Person 1: 3000€, Person 2: 2500€');

  const gehaltWeitere = insertCategory.run('Gehalt weitere Jobs', income, '#4a90d9', 2, 'income').lastInsertRowid;
  insertBudgetItem.run(gehaltWeitere, 0, 'proportional', null, null, null);

  // --- PRE-DEDUCTIONS (section: deductions, color: light blue) ---
  const deductions = insertCategory.run('Abzüge vom Gehalt', null, '#7ab8e0', 10, 'deductions').lastInsertRowid;

  const handy = insertCategory.run('Handy Vertrag', deductions, '#7ab8e0', 11, 'deductions').lastInsertRowid;
  insertBudgetItem.run(handy, 20.00, 'custom', '{"Person 1":50,"Person 2":50}', null, 'Beispiel: je 10€');

  const dticket = insertCategory.run('Deutschland Ticket', deductions, '#7ab8e0', 12, 'deductions').lastInsertRowid;
  insertBudgetItem.run(dticket, 49.00, 'custom', '{"Person 1":0,"Person 2":100}', null, 'Beispiel: nur Person 2');

  // --- SAVINGS (section: savings, color: red) ---
  const savings = insertCategory.run('Sparen', null, '#e74c3c', 20, 'savings').lastInsertRowid;

  const altersvorsorge = insertCategory.run('Altersvorsorge', savings, '#e74c3c', 21, 'savings').lastInsertRowid;
  insertBudgetItem.run(altersvorsorge, 0, 'proportional', null, 'Getrennt -> Altersvorsorge', null);

  const urlaub = insertCategory.run('Urlaub', savings, '#e74c3c', 22, 'savings').lastInsertRowid;
  insertBudgetItem.run(urlaub, 300.00, 'proportional', null, 'Zusammen -> Revolut Urlaub', null);

  // --- FIXED COSTS (section: fixed, color: yellow/orange) ---
  const fixed = insertCategory.run('Fixkosten', null, '#f39c12', 30, 'fixed').lastInsertRowid;

  const essen = insertCategory.run('Essen & Haushalt', fixed, '#f39c12', 31, 'fixed').lastInsertRowid;
  insertBudgetItem.run(essen, 500.00, 'proportional', null, 'Zusammen -> Revolut', null);

  const geschenke = insertCategory.run('Geschenke', fixed, '#f39c12', 33, 'fixed').lastInsertRowid;
  insertBudgetItem.run(geschenke, 50.00, 'proportional', null, 'Zusammen -> Revolut Geschenke', null);

  const health = insertCategory.run('Gesundheit', fixed, '#f39c12', 34, 'fixed').lastInsertRowid;
  insertBudgetItem.run(health, 50.00, 'proportional', null, 'Zusammen -> Revolut Gesundheit', null);

  // --- AUTO (section: auto, color: cyan) ---
  const auto = insertCategory.run('Auto', null, '#00bcd4', 40, 'auto').lastInsertRowid;

  const tanken = insertCategory.run('Tanken', auto, '#00bcd4', 41, 'auto').lastInsertRowid;
  insertBudgetItem.run(tanken, 100.00, 'proportional', null, 'Zusammen -> Revolut Auto', null);

  const versicherung = insertCategory.run('Versicherung', auto, '#00bcd4', 42, 'auto').lastInsertRowid;
  insertBudgetItem.run(versicherung, 50.00, 'proportional', null, 'Zusammen -> Revolut Auto', null);

  const steuer = insertCategory.run('Steuer', auto, '#00bcd4', 43, 'auto').lastInsertRowid;
  insertBudgetItem.run(steuer, 25.00, 'proportional', null, 'Zusammen -> Revolut Auto', null);

  // --- VERTRÄGE (section: contracts, color: pink/magenta) ---
  const vertraege = insertCategory.run('Verträge', null, '#e91e90', 50, 'contracts').lastInsertRowid;

  const streaming = insertCategory.run('Streaming', vertraege, '#e91e90', 51, 'contracts').lastInsertRowid;
  insertBudgetItem.run(streaming, 15.00, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  const versicherungen = insertCategory.run('Versicherungen', vertraege, '#e91e90', 52, 'contracts').lastInsertRowid;
  insertBudgetItem.run(versicherungen, 10.00, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  const fitness = insertCategory.run('Fitness', vertraege, '#e91e90', 55, 'contracts').lastInsertRowid;
  insertBudgetItem.run(fitness, 30.00, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  // --- WOHNUNG (section: housing, color: orange) ---
  const wohnung = insertCategory.run('Wohnung', null, '#ff9800', 60, 'housing').lastInsertRowid;

  const miete = insertCategory.run('Miete Warm', wohnung, '#ff9800', 61, 'housing').lastInsertRowid;
  insertBudgetItem.run(miete, 1200.00, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const strom = insertCategory.run('Strom', wohnung, '#ff9800', 62, 'housing').lastInsertRowid;
  insertBudgetItem.run(strom, 80.00, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const internet = insertCategory.run('Internet', wohnung, '#ff9800', 63, 'housing').lastInsertRowid;
  insertBudgetItem.run(internet, 30.00, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const gez = insertCategory.run('GEZ', wohnung, '#ff9800', 64, 'housing').lastInsertRowid;
  insertBudgetItem.run(gez, 18.36, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  // === ACCOUNTS (example IBANs — change these in the app!) ===
  insertAccount.run(null, 'Revolut', 'DE00 0000 0000 0000 0000 00');           // Shared Revolut
  insertAccount.run(1, 'TradeRepublic', 'DE00 0000 0000 0000 0000 01');        // Person 1 TR
  insertAccount.run(2, 'TradeRepublic', 'DE00 0000 0000 0000 0000 02');        // Person 2 TR
});

  seedAll();
  console.log('Database seeded with example data!');
}
