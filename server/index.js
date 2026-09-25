import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, seedAdmin, getSetting, setSetting } from './db.js';
import { signToken, requireAuth, requireAdmin } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

seedAdmin();

const app = express();
app.use(cors());
app.use(express.json());

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const publicMember = (m) => ({
  id: m.id,
  username: m.username,
  display_name: m.display_name,
  bio: m.bio,
  role: m.role,
  designation: m.designation || '',
  status: m.status,
  created_at: m.created_at,
});

const memberName = (m) => ({
  id: m.id,
  username: m.username,
  display_name: m.display_name,
  designation: m.designation || '',
});

const publicPayment = (p) => ({
  id: p.id,
  member_id: p.member_id,
  period: p.period,
  amount: p.amount,
  fine: p.fine,
  fine_reason: p.fine_reason || '',
  total: Number(p.amount) + Number(p.fine),
  status: p.status,
  paid_at: p.paid_at,
  display_name: p.display_name,
  username: p.username,
});

function ensureCurrentPayment(memberId) {
  const amount = Number(getSetting('monthly_amount', '0'));
  if (!(amount > 0)) return;
  const exists = db
    .prepare('SELECT id FROM payments WHERE member_id = ? AND period = ?')
    .get(memberId, currentPeriod());
  if (!exists) {
    db.prepare('INSERT INTO payments (member_id, period, amount, status) VALUES (?, ?, ?, ?)').run(
      memberId,
      currentPeriod(),
      amount,
      'unpaid'
    );
  }
}

function ensureAllPayments() {
  for (const { id } of db
    .prepare("SELECT id FROM members WHERE status = 'active'")
    .all()) {
    ensureCurrentPayment(id);
  }
}

// ---- Auth ----

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const member = db.prepare('SELECT * FROM members WHERE username = ?').get(String(username).trim());
  if (!member || !bcrypt.compareSync(String(password), member.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ member: publicMember(member), token: signToken(member) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ member: publicMember(member) });
});

// --- Access gate ---
// Every protected route (except /auth/me, used to refresh the UI) rejects
// members who have been suspended or expelled.

const STATUS_MESSAGE = {
  suspended: 'Your account has been suspended. Contact an admin for more information.',
  expelled: 'You have been expelled from this group.',
};

function loadActive(req, res, next) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  if (!member) return res.status(401).json({ error: 'Account no longer exists' });
  if (member.status !== 'active') {
    return res.status(403).json({
      error: STATUS_MESSAGE[member.status] || 'Your account is not active.',
      status: member.status,
    });
  }
  req.member = member;
  next();
}

const requireActiveUser = [requireAuth, loadActive];
const requireActiveAdmin = [requireAuth, loadActive, requireAdmin];

// ---- Members & visibility ----
// Active members see a list of names only; admin sees full profiles of everyone.

app.get('/api/members', requireActiveUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM members ORDER BY display_name COLLATE NOCASE').all();
  if (req.member.role === 'admin') {
    res.json({ members: rows.map(publicMember) });
  } else {
    res.json({ members: rows.filter((r) => r.status === 'active').map(memberName) });
  }
});

app.get('/api/members/:id', requireActiveUser, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.id !== req.member.id && req.member.role !== 'admin') {
    return res.status(403).json({ error: 'You can only view your own profile' });
  }
  res.json({ member: publicMember(member) });
});

app.patch('/api/members/me', requireActiveUser, (req, res) => {
  const { display_name, bio } = req.body || {};
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  db.prepare('UPDATE members SET display_name = ?, bio = ? WHERE id = ?').run(
    display_name != null ? String(display_name).trim() : member.display_name,
    bio != null ? String(bio).trim() : member.bio,
    req.member.id
  );
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  res.json({ member: publicMember(updated) });
});

app.post('/api/members/me/password', requireActiveUser, (req, res) => {
  const { current_password, new_password } = req.body || {};
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (!bcrypt.compareSync(String(current_password || ''), member.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(String(new_password), 10),
    member.id
  );
  res.json({ ok: true });
});

// ---- Constitution ----
// A single uploaded document (PDF or Word). Everyone can view it; only admins
// can upload. A new upload permanently replaces the previous version.

const CONSTITUTION_DIR = path.join(__dirname, 'uploads', 'constitution');

const ensureConstitutionDir = () => fs.mkdirSync(CONSTITUTION_DIR, { recursive: true });

const ALLOWED_EXT = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureConstitutionDir();
      cb(null, CONSTITUTION_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `constitution-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXT.includes(ext) && ALLOWED_MIME.includes(file.mimetype));
  },
});

const constitutionMeta = () => {
  const filename = getSetting('constitution_file', '');
  if (!filename) return { exists: false };
  return {
    exists: true,
    filename,
    name: getSetting('constitution_name', filename),
    mime: getSetting('constitution_mime', 'application/pdf'),
    size: Number(getSetting('constitution_size', 0)),
    updated_at: getSetting('constitution_updated_at', ''),
  };
};

const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

app.get('/api/constitution', requireActiveUser, (req, res) => {
  res.json(constitutionMeta());
});

app.get('/api/constitution/file', requireActiveUser, (req, res) => {
  const meta = constitutionMeta();
  if (!meta.exists) return res.status(404).json({ error: 'No constitution uploaded yet' });
  const filePath = path.join(CONSTITUTION_DIR, path.basename(meta.filename));
  if (!fs.existsSync(filePath)) {
    setSetting('constitution_file', '');
    setSetting('constitution_name', '');
    setSetting('constitution_mime', '');
    setSetting('constitution_size', '');
    setSetting('constitution_updated_at', '');
    return res.status(404).json({ error: 'No constitution uploaded yet' });
  }
  res.setHeader('Content-Type', meta.mime);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`
  );
  fs.createReadStream(filePath).pipe(res);
});

app.post('/api/admin/constitution', requireActiveAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Only PDF or Word documents are allowed' });
  if (req.file.size > MAX_FILE_SIZE) {
    fs.unlink(req.file.path, () => {});
    return res.status(413).json({ error: 'File is too large (max 15 MB)' });
  }

  const prev = getSetting('constitution_file', '');
  if (prev) fs.unlink(path.join(CONSTITUTION_DIR, path.basename(prev)), () => {});

  setSetting('constitution_file', req.file.filename);
  setSetting('constitution_name', path.basename(req.file.originalname));
  setSetting('constitution_mime', req.file.mimetype);
  setSetting('constitution_size', String(req.file.size));
  setSetting('constitution_updated_at', nowStamp());

  res.json({ ok: true, ...constitutionMeta() });
});

// ---- Settings ----

app.get('/api/admin/settings', requireActiveAdmin, (req, res) => {
  res.json({ monthly_amount: getSetting('monthly_amount', '2500') });
});

app.put('/api/admin/settings', requireActiveAdmin, (req, res) => {
  const { monthly_amount } = req.body || {};
  const amount = Number(monthly_amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'Invalid monthly amount' });
  }
  setSetting('monthly_amount', String(amount));
  res.json({ ok: true, monthly_amount: String(amount) });
});

// ---- Payments: member side ----
// Every member automatically has a payment for the current month based on the
// admin-set monthly amount. Members request approval; admin approves/rejects.

app.get('/api/payments/me', requireActiveUser, (req, res) => {
  ensureCurrentPayment(req.member.id);
  const rows = db
    .prepare('SELECT * FROM payments WHERE member_id = ? ORDER BY period DESC')
    .all(req.member.id);
  res.json({ payments: rows.map(publicPayment) });
});

app.post('/api/payments/:id/request', requireActiveUser, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.member_id !== req.member.id) {
    return res.status(403).json({ error: 'This is not your payment' });
  }
  if (payment.status !== 'unpaid') {
    return res.status(400).json({ error: 'This payment is not awaiting a request' });
  }
  db.prepare("UPDATE payments SET status = 'requested' WHERE id = ?").run(payment.id);
  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  res.json({ payment: publicPayment(updated) });
});

// ---- Payments: admin side ----

app.get('/api/admin/payments', requireActiveAdmin, (req, res) => {
  ensureAllPayments();
  const rows = db
    .prepare(
      `SELECT p.*, m.display_name, m.username
       FROM payments p JOIN members m ON m.id = p.member_id
       ORDER BY p.period DESC, m.display_name COLLATE NOCASE`
    )
    .all();
  res.json({ payments: rows.map(publicPayment) });
});

app.post('/api/admin/payments/:id/approve', requireActiveAdmin, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status === 'paid') return res.status(400).json({ error: 'Payment is already paid' });
  db.prepare("UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(
    payment.id
  );
  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  res.json({ payment: publicPayment(updated) });
});

app.post('/api/admin/payments/:id/reject', requireActiveAdmin, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'requested') {
    return res.status(400).json({ error: 'Only requested payments can be rejected' });
  }
  db.prepare("UPDATE payments SET status = 'unpaid', paid_at = NULL WHERE id = ?").run(payment.id);
  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  res.json({ payment: publicPayment(updated) });
});

app.post('/api/admin/payments/:id/fine', requireActiveAdmin, (req, res) => {
  const { amount, reason } = req.body || {};
  const fine = Number(amount);
  if (Number.isNaN(fine) || fine < 0) return res.status(400).json({ error: 'Invalid fine amount' });
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const reasonText = reason == null ? '' : String(reason).trim().slice(0, 200);
  db.prepare('UPDATE payments SET fine = ?, fine_reason = ? WHERE id = ?').run(fine, reasonText, payment.id);
  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  res.json({ payment: publicPayment(updated) });
});

// ---- Special contributions ----
// One-off collections the admin creates (weddings, harambees, events…). Each has
// an amount and a payment deadline. A member marks the payment as made and the
// admin approves it, mirroring the monthly payment flow.

const parseDeadline = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
};

const mineContribution = (c, row) => ({
  state: row ? row.status : 'unpaid',
  paid_at: row ? row.paid_at : null,
  approved_at: row ? row.approved_at : null,
});

const publicContribution = (c, mine) => ({
  id: c.id,
  title: c.title,
  description: c.description,
  amount: Number(c.amount),
  deadline: c.deadline,
  is_active: !!c.is_active,
  created_at: c.created_at,
  ...(mine ? { mine } : {}),
});

// Open (active) contributions with the calling member's payment status.
app.get('/api/contributions', requireActiveUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, cp.status AS cp_status, cp.paid_at AS cp_paid_at, cp.approved_at AS cp_approved_at
       FROM contributions c
       LEFT JOIN contribution_payments cp
         ON cp.contribution_id = c.id AND cp.member_id = ?
       WHERE c.is_active = 1
       ORDER BY c.deadline ASC, c.id DESC`
    )
    .all(req.member.id);
  res.json({
    contributions: rows.map((r) =>
      publicContribution(r, {
        state: r.cp_status || 'unpaid',
        paid_at: r.cp_paid_at,
        approved_at: r.cp_approved_at,
      })
    ),
  });
});

// Member marks "I have paid" -> status becomes 'pending' (awaiting approval).
app.post('/api/contributions/:id/pay', requireActiveUser, (req, res) => {
  const c = db
    .prepare('SELECT * FROM contributions WHERE id = ? AND is_active = 1')
    .get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contribution not found' });
  const row = db
    .prepare('SELECT * FROM contribution_payments WHERE contribution_id = ? AND member_id = ?')
    .get(c.id, req.member.id);
  if (row) {
    if (row.status === 'pending') {
      return res.status(400).json({ error: 'Your payment is already awaiting approval' });
    }
    return res.status(400).json({ error: 'Your payment for this contribution is already approved' });
  }
  db.prepare(
    "INSERT INTO contribution_payments (contribution_id, member_id, status, paid_at) VALUES (?, ?, 'pending', datetime('now'))"
  ).run(c.id, req.member.id);
  const cp = db
    .prepare('SELECT * FROM contribution_payments WHERE contribution_id = ? AND member_id = ?')
    .get(c.id, req.member.id);
  res.json({ ok: true, contribution: publicContribution(c, mineContribution(c, cp)) });
});

// Member withdraws their "I have paid" while it is still awaiting approval.
app.post('/api/contributions/:id/cancel', requireActiveUser, (req, res) => {
  const c = db
    .prepare('SELECT * FROM contributions WHERE id = ? AND is_active = 1')
    .get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contribution not found' });
  const row = db
    .prepare('SELECT * FROM contribution_payments WHERE contribution_id = ? AND member_id = ?')
    .get(c.id, req.member.id);
  if (!row || row.status !== 'pending') {
    return res.status(400).json({ error: 'There is no pending payment to cancel' });
  }
  db.prepare('DELETE FROM contribution_payments WHERE id = ?').run(row.id);
  res.json({ ok: true, contribution: publicContribution(c, mineContribution(c, null)) });
});

// Admin: all contributions with per-member payment rows for approval.
app.get('/api/admin/contributions', requireActiveAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM contributions ORDER BY id DESC').all();
  res.json({
    contributions: rows.map((c) => {
      const pays = db
        .prepare('SELECT cp.*, m.display_name, m.username FROM contribution_payments cp JOIN members m ON m.id = cp.member_id WHERE cp.contribution_id = ? ORDER BY (cp.status = \'pending\') DESC, cp.paid_at, m.display_name COLLATE NOCASE')
        .all(c.id);
      return {
        ...publicContribution(c),
        payments: pays.map((p) => ({
          id: p.id,
          member_id: p.member_id,
          display_name: p.display_name,
          username: p.username,
          status: p.status,
          paid_at: p.paid_at,
          approved_at: p.approved_at,
        })),
        stats: {
          pending: pays.filter((p) => p.status === 'pending').length,
          approved: pays.filter((p) => p.status === 'approved').length,
          members: pays.length,
        },
      };
    }),
  });
});

app.post('/api/admin/contributions', requireActiveAdmin, (req, res) => {
  const { title, description, amount, deadline } = req.body || {};
  const t = String(title || '').trim();
  if (!t) return res.status(400).json({ error: 'A title is required' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  const dl = parseDeadline(deadline);
  if (!dl) return res.status(400).json({ error: 'A valid deadline (YYYY-MM-DD) is required' });
  const info = db
    .prepare('INSERT INTO contributions (title, description, amount, deadline) VALUES (?, ?, ?, ?)')
    .run(t, String(description || '').trim(), amt, dl);
  const c = db.prepare('SELECT * FROM contributions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ contribution: publicContribution(c) });
});

app.patch('/api/admin/contributions/:id', requireActiveAdmin, (req, res) => {
  const c = db.prepare('SELECT * FROM contributions WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contribution not found' });
  const { title, description, amount, deadline, is_active } = req.body || {};

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) return res.status(400).json({ error: 'A title is required' });
    c.title = t;
  }
  if (description !== undefined) c.description = String(description).trim();
  if (amount !== undefined) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    c.amount = amt;
  }
  if (deadline !== undefined) {
    const dl = parseDeadline(deadline);
    if (!dl) return res.status(400).json({ error: 'A valid deadline (YYYY-MM-DD) is required' });
    c.deadline = dl;
  }
  if (is_active !== undefined) c.is_active = is_active ? 1 : 0;

  db.prepare(
    'UPDATE contributions SET title = ?, description = ?, amount = ?, deadline = ?, is_active = ? WHERE id = ?'
  ).run(c.title, c.description, c.amount, c.deadline, c.is_active, c.id);
  res.json({ contribution: publicContribution(db.prepare('SELECT * FROM contributions WHERE id = ?').get(c.id)) });
});

app.post('/api/admin/contributions/:id/payments/:pid/approve', requireActiveAdmin, (req, res) => {
  const row = db
    .prepare(
      'SELECT * FROM contribution_payments WHERE id = ? AND contribution_id = ?'
    )
    .get(req.params.pid, req.params.id);
  if (!row) return res.status(404).json({ error: 'Contribution payment not found' });
  if (row.status === 'approved') {
    return res.status(400).json({ error: 'This payment is already approved' });
  }
  db.prepare(
    "UPDATE contribution_payments SET status = 'approved', approved_at = datetime('now'), approved_by = ? WHERE id = ?"
  ).run(req.member.id, row.id);
  res.json({ ok: true });
});

app.post('/api/admin/contributions/:id/payments/:pid/reset', requireActiveAdmin, (req, res) => {
  const row = db
    .prepare('SELECT * FROM contribution_payments WHERE id = ? AND contribution_id = ?')
    .get(req.params.pid, req.params.id);
  if (!row) return res.status(404).json({ error: 'Contribution payment not found' });
  db.prepare('DELETE FROM contribution_payments WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// ---- Admin: member management ----

app.post('/api/admin/members', requireActiveAdmin, (req, res) => {
  const { username, password, display_name, bio, role, designation } = req.body || {};
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Username, password and display name are required' });
  }
  const name = String(username).trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
    return res.status(400).json({ error: 'Username must be 3-20 chars of letters, numbers or _' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const taken = db.prepare('SELECT id FROM members WHERE username = ?').get(name);
  if (taken) return res.status(409).json({ error: 'Username already taken' });

  const targetRole = role === 'admin' ? 'admin' : 'member';
  const targetDesignation = DESIGNATIONS.includes(designation) ? designation : '';
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare(
      'INSERT INTO members (username, password_hash, display_name, bio, role, designation) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(name, hash, String(display_name).trim(), String(bio || '').trim(), targetRole, targetDesignation);

  ensureCurrentPayment(info.lastInsertRowid);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ member: publicMember(member) });
});

app.patch('/api/admin/members/:id/role', requireActiveAdmin, (req, res) => {
  const { role } = req.body || {};
  if (!['member', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Role must be member or admin' });
  }
  const target = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (Number(req.params.id) === req.member.id && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot demote yourself' });
  }
  db.prepare('UPDATE members SET role = ? WHERE id = ?').run(role, target.id);
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(target.id);
  res.json({ member: publicMember(updated) });
});

const MEMBER_STATUSES = ['active', 'suspended', 'expelled'];

const DESIGNATIONS = [
  'Chairman',
  'Vice Chairman',
  'Secretary',
  'Treasurer',
  'Vice Treasurer',
  'Assistant Secretary',
];

// Suspend, expel, or reactivate a member. Accounts are never deleted.
app.patch('/api/admin/members/:id/status', requireActiveAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!MEMBER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status must be active, suspended or expelled' });
  }
  if (Number(req.params.id) === req.member.id) {
    if (status !== 'active') {
      return res.status(400).json({ error: 'You cannot change your own status' });
    }
    return res.json({ member: publicMember(req.member) });
  }
  const target = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.status === 'active' && status !== 'active') {
    const active = db
      .prepare("SELECT COUNT(*) AS count FROM members WHERE status = 'active'")
      .get();
    if (active.count <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last active member' });
    }
  }
  db.prepare('UPDATE members SET status = ? WHERE id = ?').run(status, target.id);
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(target.id);
  res.json({ member: publicMember(updated) });
});

// Assign or clear a committee designation (Chairman, Treasurer, etc).
app.patch('/api/admin/members/:id/designation', requireActiveAdmin, (req, res) => {
  const { designation } = req.body || {};
  const next = designation == null || designation === '' ? '' : designation;
  if (next !== '' && !DESIGNATIONS.includes(next)) {
    return res.status(400).json({ error: `Designation must be one of: ${DESIGNATIONS.join(', ')}` });
  }
  const target = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  db.prepare('UPDATE members SET designation = ? WHERE id = ?').run(next, target.id);
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(target.id);
  res.json({ member: publicMember(updated) });
});

const PORT = process.env.PORT || 4000;

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large (max 15 MB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Please upload a single document' });
    }
    return res.status(400).json({ error: 'Upload failed' });
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => console.log(`API server listening on http://localhost:${PORT}`));