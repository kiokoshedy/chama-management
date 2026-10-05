import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, 'group.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    fine REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'unpaid',
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(member_id, period)
  );

  CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    deadline TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contribution_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contribution_id INTEGER NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TEXT,
    approved_at TEXT,
    approved_by INTEGER REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(contribution_id, member_id)
  );

  CREATE TABLE IF NOT EXISTS sms_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    payment_id INTEGER REFERENCES payments(id) ON DELETE CASCADE,
    contribution_id INTEGER REFERENCES contributions(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    provider_id TEXT,
    status TEXT NOT NULL DEFAULT 'sending',
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    error TEXT
  );
`);

const memberColumns = db.prepare('PRAGMA table_info(members)').all();
if (!memberColumns.some((c) => c.name === 'status')) {
  db.exec("ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
if (!memberColumns.some((c) => c.name === 'designation')) {
  db.exec("ALTER TABLE members ADD COLUMN designation TEXT DEFAULT ''");
}
if (!memberColumns.some((c) => c.name === 'phone')) {
  db.exec("ALTER TABLE members ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
}

const paymentColumns = db.prepare('PRAGMA table_info(payments)').all();
if (!paymentColumns.some((c) => c.name === 'fine_reason')) {
  db.exec("ALTER TABLE payments ADD COLUMN fine_reason TEXT DEFAULT ''");
}
if (!paymentColumns.some((c) => c.name === 'due_date')) {
  db.exec('ALTER TABLE payments ADD COLUMN due_date TEXT');
}

// ---- Payment proof ----
// Members paste the M-Pesa or bank confirmation message they received. The raw
// text is always stored verbatim; the parsed columns are a best-effort summary
// so an admin can verify without re-reading every message by eye.

const PROOF_COLUMNS = [
  ["proof_message", "TEXT NOT NULL DEFAULT ''"],
  ['proof_provider', "TEXT NOT NULL DEFAULT ''"],
  ['proof_amount', 'REAL'],
  ["proof_code", "TEXT NOT NULL DEFAULT ''"],
  ['proof_date', 'TEXT'],
  ["proof_time", "TEXT NOT NULL DEFAULT ''"],
  ["proof_account", "TEXT NOT NULL DEFAULT ''"],
  ['proof_received_at', 'TEXT'],
];

for (const table of ['payments', 'contribution_payments']) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  for (const [name, definition] of PROOF_COLUMNS) {
    if (!existing.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function seedAdmin() {
  if (getSetting('monthly_amount', null) === null) setSetting('monthly_amount', '2500');
  const existing = db.prepare('SELECT COUNT(*) AS count FROM members').get();
  if (existing.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO members (username, password_hash, display_name, bio, role) VALUES (?, ?, ?, ?, ?)'
    ).run('admin', hash, 'Group Admin', 'Default administrator account', 'admin');
    console.log('Seeded admin account -> username: admin / password: admin123');
  }
}