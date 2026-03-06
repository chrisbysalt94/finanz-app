import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DATA_PATH = process.env.DATA_PATH || new URL('../data', import.meta.url).pathname;

if (!existsSync(DATA_PATH)) {
  mkdirSync(DATA_PATH, { recursive: true });
}

const dbPath = `${DATA_PATH}/finanz.db`;
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    net_income REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    color TEXT DEFAULT '#ffffff',
    sort_order INTEGER DEFAULT 0,
    section TEXT NOT NULL DEFAULT 'fixed'
  );

  CREATE TABLE IF NOT EXISTS budget_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount_total REAL NOT NULL DEFAULT 0,
    split_type TEXT NOT NULL DEFAULT 'proportional',
    split_custom TEXT,
    target_account TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    target_account TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    iban TEXT
  );

  CREATE TABLE IF NOT EXISTS standing_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    bank TEXT NOT NULL,
    iban TEXT,
    UNIQUE(person_id, bank)
  );
`);

// Migration: populate accounts and fix data for auto-computed transfers
const accountCount = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
if (accountCount === 0) {
  const persons = db.prepare('SELECT * FROM persons ORDER BY id').all();
  const insertAcc = db.prepare('INSERT OR IGNORE INTO accounts (person_id, bank, iban) VALUES (?, ?, ?)');

  // Shared Revolut account
  insertAcc.run(null, 'Revolut', 'DE87 1001 0178 3066 1425 18');
  // Personal TradeRepublic accounts
  if (persons[0]) insertAcc.run(persons[0].id, 'TradeRepublic', 'DE44 1001 2345 0160 0952 01');
  if (persons[1]) insertAcc.run(persons[1].id, 'TradeRepublic', 'DE90 1001 2345 0887 0632 01');

  // Set target_account for contract items that don't have one
  db.prepare(`
    UPDATE budget_items SET target_account = 'Zusammen -> Revolut Verträge'
    WHERE target_account IS NULL
    AND category_id IN (SELECT id FROM categories WHERE section = 'contracts')
  `).run();
}

// Migration: add second_income column to persons
const hasSecondIncome = db.prepare("PRAGMA table_info(persons)").all().some(c => c.name === 'second_income');
if (!hasSecondIncome) {
  db.exec('ALTER TABLE persons ADD COLUMN second_income REAL NOT NULL DEFAULT 0');
}

// Migration: add invest_amount column to persons
const hasInvestCol = db.prepare("PRAGMA table_info(persons)").all().some(c => c.name === 'invest_amount');
if (!hasInvestCol) {
  db.exec('ALTER TABLE persons ADD COLUMN invest_amount REAL NOT NULL DEFAULT 0');

  // Migrate existing investment budget item data to persons
  const investItem = db.prepare(`
    SELECT b.* FROM budget_items b
    JOIN categories c ON b.category_id = c.id
    WHERE LOWER(c.name) LIKE '%investition%'
    LIMIT 1
  `).get();

  if (investItem) {
    const persons = db.prepare('SELECT * FROM persons ORDER BY id').all();
    const totalIncome = persons.reduce((s, p) => s + p.net_income, 0);

    if (investItem.split_type === 'custom' && investItem.split_custom) {
      const custom = JSON.parse(investItem.split_custom);
      for (const p of persons) {
        const pct = custom[p.name] || 0;
        const amount = Math.round(investItem.amount_total * pct / 100 * 100) / 100;
        db.prepare('UPDATE persons SET invest_amount = ? WHERE id = ?').run(amount, p.id);
      }
    } else {
      for (const p of persons) {
        const ratio = totalIncome > 0 ? p.net_income / totalIncome : 0;
        const amount = Math.round(investItem.amount_total * ratio * 100) / 100;
        db.prepare('UPDATE persons SET invest_amount = ? WHERE id = ?').run(amount, p.id);
      }
    }

    // Remove the old investment budget item and category
    db.prepare('DELETE FROM budget_items WHERE id = ?').run(investItem.id);
    db.prepare('DELETE FROM categories WHERE id = ? AND (SELECT COUNT(*) FROM budget_items WHERE category_id = ?) = 0')
      .run(investItem.category_id, investItem.category_id);
  }
}

export default db;
