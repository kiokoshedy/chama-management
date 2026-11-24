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
    pending_balance REAL NOT NULL DEFAULT 0,
    pending_fine REAL NOT NULL DEFAULT 0,
    pending_fine_reason TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    response TEXT NOT NULL DEFAULT '',
    decided_by INTEGER REFERENCES members(id),
    decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    meeting_date TEXT NOT NULL,
    description TEXT DEFAULT '',
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'application/pdf',
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Fines stand on their own: a member can be fined for being late, missing a
  -- meeting, or any other reason, without a contribution having to exist. Each
  -- fine keeps its own reason and can be paid (in full or in part) separately.
  CREATE TABLE IF NOT EXISTS fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    amount_paid REAL NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );

  -- A single "I have paid" action can cover several pending amounts. A request
  -- records the total the member says they paid plus one row per amount it is
  -- meant to settle (monthly dues, a contribution, a fine, or arrears). The
  -- admin approves the whole request; only then are the balances reduced.
  CREATE TABLE IF NOT EXISTS payment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT,
    decided_by INTEGER REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS payment_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    amount REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_fines_member ON fines(member_id);
  CREATE INDEX IF NOT EXISTS idx_requests_member ON payment_requests(member_id, status);
  CREATE INDEX IF NOT EXISTS idx_request_items_request ON payment_request_items(request_id);
`);

// SMS reminders are no longer part of the app; drop the old table if present.
db.exec('DROP TABLE IF EXISTS sms_reminders');

const memberColumns = db.prepare('PRAGMA table_info(members)').all();
if (!memberColumns.some((c) => c.name === 'status')) {
  db.exec("ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}
if (!memberColumns.some((c) => c.name === 'status_reason')) {
  db.exec("ALTER TABLE members ADD COLUMN status_reason TEXT NOT NULL DEFAULT ''");
}
if (!memberColumns.some((c) => c.name === 'designation')) {
  db.exec("ALTER TABLE members ADD COLUMN designation TEXT DEFAULT ''");
}
if (!memberColumns.some((c) => c.name === 'phone')) {
  db.exec("ALTER TABLE members ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
}
if (!memberColumns.some((c) => c.name === 'pending_balance')) {
  db.exec('ALTER TABLE members ADD COLUMN pending_balance REAL NOT NULL DEFAULT 0');
}
if (!memberColumns.some((c) => c.name === 'pending_fine')) {
  db.exec('ALTER TABLE members ADD COLUMN pending_fine REAL NOT NULL DEFAULT 0');
}
if (!memberColumns.some((c) => c.name === 'pending_fine_reason')) {
  db.exec("ALTER TABLE members ADD COLUMN pending_fine_reason TEXT NOT NULL DEFAULT ''");
}

const paymentColumns = db.prepare('PRAGMA table_info(payments)').all();
if (!paymentColumns.some((c) => c.name === 'fine_reason')) {
  db.exec("ALTER TABLE payments ADD COLUMN fine_reason TEXT DEFAULT ''");
}
if (!paymentColumns.some((c) => c.name === 'due_date')) {
  db.exec('ALTER TABLE payments ADD COLUMN due_date TEXT');
}
if (!paymentColumns.some((c) => c.name === 'amount_paid')) {
  db.exec('ALTER TABLE payments ADD COLUMN amount_paid REAL NOT NULL DEFAULT 0');
}

const contributionPaymentColumns = db.prepare('PRAGMA table_info(contribution_payments)').all();
if (!contributionPaymentColumns.some((c) => c.name === 'amount_paid')) {
  db.exec('ALTER TABLE contribution_payments ADD COLUMN amount_paid REAL NOT NULL DEFAULT 0');
}

// ---- Payment proof ----
// Members paste the M-Pesa or Bank confirmation message they received. The raw
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

for (const table of ['payments', 'contribution_payments', 'payment_requests']) {
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

// Older versions stored one fine on the member and another on each monthly
// payment. Move both into independent fine records once, then stop using those
// columns. Keeping the migration one-shot means a restored backup cannot
// duplicate fines on every restart.
function migrateLegacyFines() {
  if (getSetting('fines_independent', '') === '1') return;

  const insert = db.prepare(
    `INSERT INTO fines (member_id, amount, reason, amount_paid, created_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const row of db
    .prepare("SELECT id, pending_fine, pending_fine_reason FROM members WHERE role = 'member' AND pending_fine > 0")
    .all()) {
    insert.run(
      row.id,
      row.pending_fine,
      row.pending_fine_reason || 'Fine recorded on member',
      0,
      datetimeNow(),
      null
    );
  }
  for (const row of db
    .prepare('SELECT * FROM payments WHERE fine > 0')
    .all()) {
    const settled = row.status === 'paid';
    insert.run(
      row.member_id,
      row.fine,
      row.fine_reason || `Fine for ${row.period}`,
      settled ? row.fine : 0,
      row.created_at || datetimeNow(),
      settled ? row.paid_at || row.created_at || datetimeNow() : null
    );
  }
  db.exec("UPDATE members SET pending_fine = 0, pending_fine_reason = ''");
  db.exec("UPDATE payments SET fine = 0, fine_reason = ''");
  setSetting('fines_independent', '1');
}

const datetimeNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

migrateLegacyFines();

// Older databases marked monthly payments and contributions as paid before the
// amount_paid column existed, so those rows kept a zero paid amount and still
// counted as outstanding. Approved records are fully paid by definition; keep
// their paid amount in step with the current amount on every startup.
function syncPaidAmounts() {
  db.exec(`
    UPDATE payments
    SET amount_paid = ROUND(amount + COALESCE(fine, 0), 2)
    WHERE status = 'paid'
      AND ROUND(COALESCE(amount_paid, 0), 2) <> ROUND(amount + COALESCE(fine, 0), 2);
  `);
  db.exec(`
    UPDATE contribution_payments
    SET amount_paid = (SELECT ROUND(c.amount, 2) FROM contributions c WHERE c.id = contribution_id)
    WHERE status = 'approved'
      AND ROUND(COALESCE(amount_paid, 0), 2) <>
          (SELECT ROUND(c.amount, 2) FROM contributions c WHERE c.id = contribution_id);
  `);
}

syncPaidAmounts();

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