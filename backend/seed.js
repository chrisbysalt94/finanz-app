import db from './db.js';

// Only seed if DB is empty
const count = db.prepare('SELECT COUNT(*) as c FROM persons').get().c;
if (count > 0) {
  console.log('Database already seeded, skipping.');
} else {

console.log('Seeding database with initial data...');

const insertPerson = db.prepare('INSERT INTO persons (name, net_income) VALUES (?, ?)');
const insertCategory = db.prepare('INSERT INTO categories (name, parent_id, color, sort_order, section) VALUES (?, ?, ?, ?, ?)');
const insertBudgetItem = db.prepare('INSERT INTO budget_items (category_id, amount_total, split_type, split_custom, target_account, notes) VALUES (?, ?, ?, ?, ?, ?)');
const insertAccount = db.prepare('INSERT INTO accounts (person_id, bank, iban) VALUES (?, ?, ?)');

const seedAll = db.transaction(() => {
  // === PERSONS (with investment amounts) ===
  insertPerson.run('Chris', 3906.60);
  insertPerson.run('Yana', 2500.00);
  // Set invest_amount: ~33% of salary each
  db.prepare('UPDATE persons SET invest_amount = ? WHERE name = ?').run(1300, 'Chris');
  db.prepare('UPDATE persons SET invest_amount = ? WHERE name = ?').run(800, 'Yana');

  // === CATEGORIES & BUDGET ITEMS ===

  // --- INCOME (section: income, color: blue) ---
  const income = insertCategory.run('Einkommen', null, '#4a90d9', 0, 'income').lastInsertRowid;

  const gehaltHaupt = insertCategory.run('Gehalts Hauptjob', income, '#4a90d9', 1, 'income').lastInsertRowid;
  // Gehalt is income, not a cost - we store it but it's displayed differently
  insertBudgetItem.run(gehaltHaupt, 6406.60, 'custom', '{"Chris":60.98,"Yana":39.02}', null, 'Chris: 3906.60€, Yana: 2500.00€');

  const gehaltWeitere = insertCategory.run('Gehalt weitere Jobs', income, '#4a90d9', 2, 'income').lastInsertRowid;
  insertBudgetItem.run(gehaltWeitere, 0, 'proportional', null, null, null);

  // --- PRE-DEDUCTIONS (section: deductions, color: light blue) ---
  const deductions = insertCategory.run('Abzüge vom Gehalt', null, '#7ab8e0', 10, 'deductions').lastInsertRowid;

  const handy = insertCategory.run('Handy Vertrag', deductions, '#7ab8e0', 11, 'deductions').lastInsertRowid;
  insertBudgetItem.run(handy, 9.99, 'custom', '{"Chris":20.02,"Yana":79.98}', null, 'Chris: 2.00€, Yana: 7.99€');

  const dticket = insertCategory.run('Deutschland Ticket / Tanken', deductions, '#7ab8e0', 12, 'deductions').lastInsertRowid;
  insertBudgetItem.run(dticket, 55.00, 'custom', '{"Chris":0,"Yana":100}', null, 'Nur Yana');

  const nabuCasa = insertCategory.run('Nabu Casa', deductions, '#7ab8e0', 13, 'deductions').lastInsertRowid;
  insertBudgetItem.run(nabuCasa, 6.25, 'custom', '{"Chris":100,"Yana":0}', null, 'Nur Chris');

  // Investitionen are now handled via persons.invest_amount, not as budget items

  // --- SAVINGS (section: savings, color: red) ---
  const savings = insertCategory.run('Sparen', null, '#e74c3c', 20, 'savings').lastInsertRowid;

  const altersvorsorge = insertCategory.run('Altersvorsorge', savings, '#e74c3c', 21, 'savings').lastInsertRowid;
  insertBudgetItem.run(altersvorsorge, 0, 'proportional', null, 'Getrennt -> Altersvorsorge', null);

  const urlaub = insertCategory.run('Urlaub', savings, '#e74c3c', 22, 'savings').lastInsertRowid;
  insertBudgetItem.run(urlaub, 635.30, 'proportional', null, 'Zusammen -> MVB + Barclay', null);

  // --- FIXED COSTS (section: fixed, color: yellow/orange) ---
  const fixed = insertCategory.run('Fixkosten', null, '#f39c12', 30, 'fixed').lastInsertRowid;

  const essen = insertCategory.run('Essen, Medikamente, etc.', fixed, '#f39c12', 31, 'fixed').lastInsertRowid;
  insertBudgetItem.run(essen, 700.00, 'proportional', null, 'Zusammen -> Revolut', null);

  const sparenGross = insertCategory.run('Sparen für große Dinge / Klamotten / Bücher etc.', fixed, '#f39c12', 32, 'fixed').lastInsertRowid;
  insertBudgetItem.run(sparenGross, 150.00, 'proportional', null, 'Getrennt -> Revolut Spar Konto', null);

  const geschenke = insertCategory.run('Geschenke etc.', fixed, '#f39c12', 33, 'fixed').lastInsertRowid;
  insertBudgetItem.run(geschenke, 75.00, 'proportional', null, 'Zusammen -> Revolute Geschenke', null);

  const health = insertCategory.run('Health', fixed, '#f39c12', 34, 'fixed').lastInsertRowid;
  insertBudgetItem.run(health, 50.00, 'proportional', null, 'Zusammen -> Revolute Health', null);

  const haushalt = insertCategory.run('Haushalt', fixed, '#f39c12', 35, 'fixed').lastInsertRowid;
  insertBudgetItem.run(haushalt, 50.00, 'proportional', null, 'Zusammen -> Revolut Haushalt', null);

  // --- AUTO (section: auto, color: cyan) ---
  const auto = insertCategory.run('Auto', null, '#00bcd4', 40, 'auto').lastInsertRowid;

  const tanken = insertCategory.run('Tanken', auto, '#00bcd4', 41, 'auto').lastInsertRowid;
  insertBudgetItem.run(tanken, 100.00, 'custom', '{"Chris":75,"Yana":25}', 'Zusammen -> Revolute Tanken', '+200 Tanken für Arbeit');

  const versicherung = insertCategory.run('Versicherung', auto, '#00bcd4', 42, 'auto').lastInsertRowid;
  insertBudgetItem.run(versicherung, 36.67, 'proportional', null, 'Zusammen -> Revolute Auto', null);

  const steuer = insertCategory.run('Steuer', auto, '#00bcd4', 43, 'auto').lastInsertRowid;
  insertBudgetItem.run(steuer, 24.33, 'proportional', null, 'Zusammen -> Revolute Auto', null);

  const pflege = insertCategory.run('Pflege und Reparatur', auto, '#00bcd4', 44, 'auto').lastInsertRowid;
  insertBudgetItem.run(pflege, 50.00, 'proportional', null, 'Zusammen -> Revolut Auto', null);

  const parkplatzAuto = insertCategory.run('Parkplatz', auto, '#00bcd4', 45, 'auto').lastInsertRowid;
  insertBudgetItem.run(parkplatzAuto, 0, 'proportional', null, null, null);

  // --- VERTRÄGE (section: contracts, color: pink/magenta) ---
  const vertraege = insertCategory.run('Verträge', null, '#e91e90', 50, 'contracts').lastInsertRowid;

  const appleOne = insertCategory.run('Apple One', vertraege, '#e91e90', 51, 'contracts').lastInsertRowid;
  insertBudgetItem.run(appleOne, 13.98, 'proportional', null, 'Zusammen -> Revolut Verträge', '34.95 Insgesamt');

  const auslandskv = insertCategory.run('Auslandskrankenversicherung', vertraege, '#e91e90', 52, 'contracts').lastInsertRowid;
  insertBudgetItem.run(auslandskv, 3.00, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  const tekisHausrat = insertCategory.run('Tekis - Hausrat', vertraege, '#e91e90', 53, 'contracts').lastInsertRowid;
  insertBudgetItem.run(tekisHausrat, 5.58, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  const tekisHaftpflicht = insertCategory.run('Tekis Haftpflicht', vertraege, '#e91e90', 54, 'contracts').lastInsertRowid;
  insertBudgetItem.run(tekisHaftpflicht, 4.32, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  const fitness = insertCategory.run('Fitness', vertraege, '#e91e90', 55, 'contracts').lastInsertRowid;
  insertBudgetItem.run(fitness, 33.00, 'proportional', null, 'Zusammen -> Revolut Verträge', null);

  // --- WOHNUNG (section: housing, color: orange) ---
  const wohnung = insertCategory.run('Wohnung ins.', null, '#ff9800', 60, 'housing').lastInsertRowid;

  const miete = insertCategory.run('Miete Warm', wohnung, '#ff9800', 61, 'housing').lastInsertRowid;
  insertBudgetItem.run(miete, 1530.00, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const strom = insertCategory.run('Strom', wohnung, '#ff9800', 62, 'housing').lastInsertRowid;
  insertBudgetItem.run(strom, 105.00, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const internet = insertCategory.run('Internet', wohnung, '#ff9800', 63, 'housing').lastInsertRowid;
  insertBudgetItem.run(internet, 33.95, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const gez = insertCategory.run('GEZ', wohnung, '#ff9800', 64, 'housing').lastInsertRowid;
  insertBudgetItem.run(gez, 19.00, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  const parkplatzW = insertCategory.run('Parkplatz', wohnung, '#ff9800', 65, 'housing').lastInsertRowid;
  insertBudgetItem.run(parkplatzW, 69.21, 'proportional', null, 'Zusammen -> Revolut Wohnung', null);

  // === ACCOUNTS (IBANs) ===
  insertAccount.run(null, 'Revolut', 'DE87 1001 0178 3066 1425 18');          // Shared Revolut
  insertAccount.run(1, 'TradeRepublic', 'DE44 1001 2345 0160 0952 01');       // Chris TR
  insertAccount.run(2, 'TradeRepublic', 'DE90 1001 2345 0887 0632 01');       // Yana TR
});

  seedAll();
  console.log('Database seeded successfully!');
}
