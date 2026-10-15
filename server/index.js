import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, seedAdmin, getSetting, setSetting } from './db.js';
import { signToken, requireAuth, requireAdmin } from './auth.js';
import { analyzeProof, cleanProofMessage, PROVIDER_LABELS, MAX_PROOF_LENGTH } from './proof.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

seedAdmin();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const currentPeriod = () => kenyaDate().slice(0, 7);

const publicMember = (m) => ({
  id: m.id,
  username: m.username,
  display_name: m.display_name,
  bio: m.bio,
  phone: m.phone || '',
  role: m.role,
  designation: m.designation || '',
  status: m.status,
  status_reason: m.status_reason || '',
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
  due_date: p.due_date || null,
  fine_reason: p.fine_reason || '',
  total: Number(p.amount) + Number(p.fine),
  status: p.status,
  paid_at: p.paid_at,
  display_name: p.display_name,
  username: p.username,
  proof: proofSummary(p),
});

// ---- Payment proof ----
// Every "I have paid" click requires the member to paste the confirmation
// message they received (M-Pesa or Bank). The raw text is stored verbatim and
// the parsed details are cached alongside it for the admin's review screen.

function proofSummary(row) {
  if (!row.proof_message) return null;
  return {
    message: row.proof_message,
    provider: row.proof_provider || 'unknown',
    provider_label: PROVIDER_LABELS[row.proof_provider] || PROVIDER_LABELS.unknown,
    amount: row.proof_amount == null ? null : Number(row.proof_amount),
    code: row.proof_code || '',
    date: row.proof_date || null,
    time: row.proof_time || '',
    account: row.proof_account || '',
    received_at: row.proof_received_at || null,
  };
}

// Validates the pasted message and returns the parsed summary to persist.
function readProof(value) {
  const cleaned = cleanProofMessage(value);
  if (!cleaned.ok) return { error: cleaned.error };
  const parsed = analyzeProof(cleaned.text);
  return {
    proof: [
      cleaned.text,
      parsed.provider,
      parsed.amount,
      parsed.code,
      parsed.date,
      parsed.time,
      parsed.account,
    ],
    parsed,
  };
}


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

const SMS_REMINDER_DAYS = 5;
const AFRICASTALKING_SMS_URL = {
  live: process.env.AFRICASTALKING_API_URL || 'https://api.africastalking.com/version1/messaging/bulk',
  sandbox:
    process.env.AFRICASTALKING_API_URL || 'https://api.sandbox.africastalking.com/version1/messaging/bulk',
};

const smsConfig = () => {
  const environment = String(process.env.AFRICASTALKING_ENV || 'sandbox').toLowerCase();
  return {
    username: process.env.AFRICASTALKING_USERNAME || '',
    apiKey: process.env.AFRICASTALKING_API_KEY || '',
    senderId: process.env.AFRICASTALKING_SENDER_ID || '',
    environment: environment === 'live' ? 'live' : 'sandbox',
  };
};

const smsConfigured = () => {
  const config = smsConfig();
  return Boolean(config.username && config.apiKey && config.senderId);
};

const kenyaDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
};

const normalizeKenyanPhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  let number = digits;
  if (number.startsWith('0')) number = `254${number.slice(1)}`;
  else if (number.startsWith('7') && number.length === 9) number = `254${number}`;
  if (!/^2547\d{8}$/.test(number)) return null;
  return `+${number}`;
};

const formatMoney = (amount) =>
  new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(Number(amount || 0));

const reminderMessage = (candidate) => {
  const label =
    candidate.kind === 'monthly'
      ? 'monthly contribution'
      : `special contribution "${candidate.title}"`;
  return `Hello ${candidate.displayName}, your ${label} of KSh ${formatMoney(candidate.amount)} is due on ${candidate.dueDate}. Please pay before the due date.`;
};

const sendAfricaTalkingSms = async (phone, message) => {
  const config = smsConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(AFRICASTALKING_SMS_URL[config.environment], {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apiKey: config.apiKey,
      },
      body: JSON.stringify({
        username: config.username,
        message,
        senderId: config.senderId,
        phoneNumbers: [phone],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error("Africa's Talking request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `Africa's Talking request failed (${response.status})`);
  }
  const recipient =
    body.SMSMessageData?.Recipients?.[0] ||
    (body.messageId
      ? { messageId: body.messageId, status: body.status, statusCode: body.statusCode }
      : null);
  const recipientStatus = String(recipient?.status || '').toLowerCase();
  const failedStatus = /fail|reject|error|invalid/.test(recipientStatus);
  if (!recipient || Number(recipient.statusCode) >= 400 || failedStatus) {
    throw new Error(recipient?.message || recipient?.status || "Africa's Talking rejected the message");
  }
  if (!recipient.messageId) {
    throw new Error("Africa's Talking did not return a message ID");
  }
  return {
    providerId: recipient.messageId,
    providerStatus: recipient.status || String(recipient.statusCode || ''),
  };
};

const claimSmsReminder = (candidate, message) => {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO sms_reminders
       (reminder_key, kind, payment_id, contribution_id, member_id, phone, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      candidate.key,
      candidate.kind,
      candidate.paymentId || null,
      candidate.contributionId || null,
      candidate.memberId,
      candidate.phone,
      message
    );
  return result.changes === 1 ? Number(result.lastInsertRowid) : null;
};

const sendSmsReminder = async (candidate) => {
  if (!candidate.phone) return { skipped: true, reason: 'missing_phone' };
  const message = reminderMessage(candidate);
  const reminderId = claimSmsReminder(candidate, message);
  if (!reminderId) return { skipped: true, reason: 'already_sent' };
  try {
    const result = await sendAfricaTalkingSms(candidate.phone, message);
    db.prepare(
      "UPDATE sms_reminders SET provider_id = ?, status = 'sent', error = NULL WHERE id = ?"
    ).run(result.providerId, reminderId);
    return { sent: true };
  } catch (error) {
    db.prepare('DELETE FROM sms_reminders WHERE id = ?').run(reminderId);
    return { failed: true, error: error.message };
  }
};

let smsReminderRunning = false;
const runSmsReminders = async () => {
  if (smsReminderRunning) return { configured: smsConfigured(), skipped: true, reason: 'already_running' };
  if (!smsConfigured()) return { configured: false, sent: 0, failed: 0, skipped: 0, candidates: 0 };
  smsReminderRunning = true;
  try {
    ensureAllPayments();
    db.prepare(
      "DELETE FROM sms_reminders WHERE status = 'sending' AND sent_at < datetime('now', '-30 minutes')"
    ).run();
    const todayDate = kenyaDate();
    const reminderDate = addDays(todayDate, SMS_REMINDER_DAYS);
    const catchUpDate = addDays(todayDate, SMS_REMINDER_DAYS - 1);
    const candidates = [];
    const monthly = db
      .prepare(
        `SELECT p.id AS payment_id, p.amount, p.fine, p.due_date,
                m.id AS member_id, m.display_name, m.phone
         FROM payments p
         JOIN members m ON m.id = p.member_id
         WHERE p.status = 'unpaid' AND p.due_date IN (?, ?) AND m.status = 'active'`
      )
      .all(reminderDate, catchUpDate);
    for (const row of monthly) {
      candidates.push({
        key: `monthly:${row.payment_id}:${row.due_date}`,
        kind: 'monthly',
        paymentId: row.payment_id,
        memberId: row.member_id,
        displayName: row.display_name,
        phone: row.phone,
        amount: Number(row.amount) + Number(row.fine || 0),
        dueDate: row.due_date,
      });
    }

    const special = db
      .prepare(
        `SELECT c.id AS contribution_id, c.title, c.amount, c.deadline,
                m.id AS member_id, m.display_name, m.phone
         FROM contributions c
         CROSS JOIN members m
         LEFT JOIN contribution_payments cp
           ON cp.contribution_id = c.id AND cp.member_id = m.id
         WHERE c.is_active = 1 AND c.deadline IN (?, ?) AND m.status = 'active'
           AND (cp.id IS NULL OR cp.status NOT IN ('pending', 'approved'))`
      )
      .all(reminderDate, catchUpDate);
    for (const row of special) {
      candidates.push({
        key: `special:${row.contribution_id}:${row.member_id}:${row.deadline}`,
        kind: 'special',
        contributionId: row.contribution_id,
        memberId: row.member_id,
        displayName: row.display_name,
        phone: row.phone,
        title: row.title,
        amount: row.amount,
        dueDate: row.deadline,
      });
    }

    const results = [];
    for (const candidate of candidates) results.push(await sendSmsReminder(candidate));
    return {
      configured: true,
      reminder_date: reminderDate,
      catch_up_date: catchUpDate,
      candidates: candidates.length,
      sent: results.filter((result) => result.sent).length,
      failed: results.filter((result) => result.failed).length,
      skipped: results.filter((result) => result.skipped).length,
    };
  } finally {
    smsReminderRunning = false;
  }
};

const startSmsReminderScheduler = () => {
  const check = () => {
    runSmsReminders().catch((error) => console.error('SMS reminder check failed:', error.message));
  };
  check();
  const timer = setInterval(check, 60 * 60 * 1000);
  timer.unref?.();
};

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
      reason: member.status_reason || '',
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
  const { display_name, bio, phone } = req.body || {};
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  let nextPhone = member.phone || '';
  if (phone != null) {
    const normalized = normalizeKenyanPhone(phone);
    if (normalized === null) {
      return res.status(400).json({ error: 'Enter a valid Kenyan mobile number, e.g. 0712345678' });
    }
    nextPhone = normalized;
  }
  db.prepare('UPDATE members SET display_name = ?, bio = ?, phone = ? WHERE id = ?').run(
    display_name != null ? String(display_name).trim() : member.display_name,
    bio != null ? String(bio).trim() : member.bio,
    nextPhone,
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
    fs.unlink(req.file.path, () => { });
    return res.status(413).json({ error: 'File is too large (max 15 MB)' });
  }

  const prev = getSetting('constitution_file', '');
  if (prev) fs.unlink(path.join(CONSTITUTION_DIR, path.basename(prev)), () => { });

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
// admin-set monthly amount. Members paste their transaction confirmation and
// request approval; admin approves/rejects.

app.post('/api/proof/parse', requireActiveUser, (req, res) => {
  const text = String(req.body?.message ?? '').trim();
  if (!text) return res.json({ parsed: null, warnings: [], max_length: MAX_PROOF_LENGTH });
  res.json({ ...analyzeProof(text), max_length: MAX_PROOF_LENGTH });
});

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
  const { error, proof } = readProof(req.body?.proof_message);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE payments
     SET status = 'requested',
         proof_message = ?, proof_provider = ?, proof_amount = ?, proof_code = ?,
         proof_date = ?, proof_time = ?, proof_account = ?, proof_received_at = datetime('now')
     WHERE id = ?`
  ).run(...proof, payment.id);
  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  res.json({ payment: publicPayment(updated) });
});

// A member can replace the message they pasted while it is still awaiting review.
app.patch('/api/payments/:id/proof', requireActiveUser, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.member_id !== req.member.id) {
    return res.status(403).json({ error: 'This is not your payment' });
  }
  if (payment.status !== 'requested') {
    return res.status(400).json({ error: 'Proof can only be changed while awaiting approval' });
  }
  const { error, proof } = readProof(req.body?.proof_message);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE payments
     SET proof_message = ?, proof_provider = ?, proof_amount = ?, proof_code = ?,
         proof_date = ?, proof_time = ?, proof_account = ?, proof_received_at = datetime('now')
     WHERE id = ?`
  ).run(...proof, payment.id);
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
  // The pasted message is dropped so the member submits fresh proof next time.
  db.prepare(
    `UPDATE payments
     SET status = 'unpaid', paid_at = NULL,
         proof_message = '', proof_provider = '', proof_amount = NULL, proof_code = '',
         proof_date = NULL, proof_time = '', proof_account = '', proof_received_at = NULL
     WHERE id = ?`
  ).run(payment.id);
  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  res.json({ payment: publicPayment(updated) });
});

app.patch('/api/admin/payments/:id/due-date', requireActiveAdmin, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const value = req.body?.due_date;
  if (value === undefined) return res.status(400).json({ error: 'A due date is required' });
  const dueDate = value === null || value === '' ? null : parseDateOnly(value);
  if (value !== null && value !== '' && !dueDate) {
    return res.status(400).json({ error: 'Due date must be a valid date (YYYY-MM-DD)' });
  }
  db.prepare('UPDATE payments SET due_date = ? WHERE id = ?').run(dueDate, payment.id);
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

// ---- Payments: month export ----
// A single month's records as a spreadsheet-friendly CSV: one section for the
// monthly contributions and one for any special contributions whose deadline
// falls in that month. Admins get every member, members get only their own rows.

const parsePeriod = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
};

const periodLabel = (period) => {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const kenyaStamp = (date = new Date()) =>
  `${kenyaDate(date)} ${date.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;

// Member names and fine reasons are free text, so quote defensively and neutralise
// leading characters that spreadsheets would otherwise treat as a formula.
const csvCell = (value) => {
  if (value == null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvDocument = (rows) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

const blankRow = (width) => new Array(width).fill('');

const MONTHLY_STATUS_LABELS = {
  paid: 'Paid',
  requested: 'Awaiting approval',
  unpaid: 'Not paid',
};

const CONTRIB_STATUS_LABELS = { approved: 'Approved', pending: 'Awaiting approval' };

const MONTHLY_HEADER = [
  'Member', 'Username', 'Phone', 'Contribution', 'Fine', 'Fine reason', 'Total',
  'Status', 'Due date', 'Paid at', 'Proof from', 'Proof reference',
  'Proof amount', 'Proof date',
];

const SPECIAL_HEADER = [
  'Contribution', 'Deadline', 'Member', 'Username', 'Phone', 'Amount', 'Status',
  'Paid at', 'Approved at', 'Proof from', 'Proof reference', 'Proof amount', 'Proof date',
];

const fetchMonthlyRows = (period, memberId) =>
  db
    .prepare(
      `SELECT p.*, m.display_name, m.username, m.phone
       FROM payments p JOIN members m ON m.id = p.member_id
       WHERE p.period = ?${memberId ? ' AND p.member_id = ?' : ''}
       ORDER BY m.display_name COLLATE NOCASE`
    )
    .all(...(memberId ? [period, memberId] : [period]));

// Every active member gets a row, so an unpaid contribution still shows up.
const fetchSpecialRows = (period, memberId) =>
  db
    .prepare(
      `SELECT c.title, c.amount, c.deadline,
              m.display_name, m.username, m.phone,
              cp.status AS cp_status, cp.paid_at, cp.approved_at,
              cp.proof_provider, cp.proof_amount, cp.proof_code, cp.proof_date
       FROM contributions c
       CROSS JOIN members m
       LEFT JOIN contribution_payments cp
         ON cp.contribution_id = c.id AND cp.member_id = m.id
       WHERE substr(c.deadline, 1, 7) = ? AND m.status = 'active'${memberId ? ' AND m.id = ?' : ''}
       ORDER BY c.deadline ASC, c.title COLLATE NOCASE, m.display_name COLLATE NOCASE`
    )
    .all(...(memberId ? [period, memberId] : [period]));

function monthCsv(period, memberId) {
  const monthly = fetchMonthlyRows(period, memberId);
  const special = fetchSpecialRows(period, memberId);
  const rows = [];

  rows.push(['Payments report']);
  rows.push([periodLabel(period)]);
  rows.push([`Generated ${kenyaStamp()} (EAT)`]);
  rows.push(blankRow(MONTHLY_HEADER.length));

  // ---- Monthly contributions ----
  const billed = monthly.reduce((sum, p) => sum + Number(p.amount) + Number(p.fine || 0), 0);
  const collected = monthly
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount) + Number(p.fine || 0), 0);
  const pendingCount = monthly.filter((p) => p.status === 'requested').length;
  const unpaidCount = monthly.filter((p) => p.status === 'unpaid').length;

  rows.push(['Monthly contributions']);
  rows.push(['Members', String(monthly.length)]);
  rows.push(['Billed', billed]);
  rows.push(['Collected', collected]);
  rows.push(['Outstanding', Number((billed - collected).toFixed(2))]);
  rows.push(['Awaiting approval', String(pendingCount)]);
  rows.push(['Not paid', String(unpaidCount)]);
  rows.push(blankRow(MONTHLY_HEADER.length));
  rows.push(MONTHLY_HEADER);
  for (const p of monthly) {
    rows.push([
      p.display_name,
      p.username,
      p.phone || '',
      Number(p.amount),
      Number(p.fine || 0),
      p.fine_reason || '',
      Number(p.amount) + Number(p.fine || 0),
      MONTHLY_STATUS_LABELS[p.status] || p.status,
      p.due_date || '',
      p.paid_at || '',
      p.proof_provider ? PROVIDER_LABELS[p.proof_provider] || p.proof_provider : '',
      p.proof_code || '',
      p.proof_amount == null ? '' : Number(p.proof_amount),
      p.proof_date || '',
    ]);
  }
  rows.push(['Total collected', '', '', '', '', '', collected, '', '', '', '', '', '', '']);
  rows.push(blankRow(MONTHLY_HEADER.length));

  // ---- Special contributions due this month ----
  const titles = [...new Set(special.map((s) => s.title))];
  const approvedTotal = special
    .filter((s) => s.cp_status === 'approved')
    .reduce((sum, s) => sum + Number(s.amount), 0);

  rows.push(['Special contributions due this month']);
  if (titles.length === 0) {
    rows.push(['None due this month']);
  } else {
    rows.push(['Collections', String(titles.length)]);
    rows.push(['Approved total', approvedTotal]);
    rows.push(blankRow(SPECIAL_HEADER.length));
    rows.push(SPECIAL_HEADER);
    for (const s of special) {
      rows.push([
        s.title,
        s.deadline,
        s.display_name,
        s.username,
        s.phone || '',
        Number(s.amount),
        (s.cp_status && CONTRIB_STATUS_LABELS[s.cp_status]) || 'Not paid',
        s.paid_at || '',
        s.approved_at || '',
        s.proof_provider ? PROVIDER_LABELS[s.proof_provider] || s.proof_provider : '',
        s.proof_code || '',
        s.proof_amount == null ? '' : Number(s.proof_amount),
        s.proof_date || '',
      ]);
    }
    rows.push([
      'Total approved', '', '', '', '', approvedTotal, '', '', '', '', '', '', '',
    ]);
  }

  return csvDocument(rows);
}

function sendMonthCsv(res, period, memberId, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(monthCsv(period, memberId));
}

app.get('/api/admin/payments/export', requireActiveAdmin, (req, res) => {
  const period = parsePeriod(req.query.period);
  if (!period) return res.status(400).json({ error: 'Pick a month to download (YYYY-MM)' });
  sendMonthCsv(res, period, null, `payments-${period}.csv`);
});

app.get('/api/payments/me/export', requireActiveUser, (req, res) => {
  const period = parsePeriod(req.query.period);
  if (!period) return res.status(400).json({ error: 'Pick a month to download (YYYY-MM)' });
  sendMonthCsv(res, period, req.member.id, `my-payments-${period}.csv`);
});



// ---- Special contributions ----
// One-off collections the admin creates (weddings, harambees, events…). Each has
// an amount and a payment deadline. A member marks the payment as made and the
// admin approves it, mirroring the monthly payment flow.

const parseDeadline = (v) => parseDateOnly(v);

const mineContribution = (c, row) => ({
  state: row ? row.status : 'unpaid',
  paid_at: row ? row.paid_at : null,
  approved_at: row ? row.approved_at : null,
  proof: row ? proofSummary(row) : null,
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
      `SELECT c.*, cp.id AS cp_id
       FROM contributions c
       LEFT JOIN contribution_payments cp
         ON cp.contribution_id = c.id AND cp.member_id = ?
       WHERE c.is_active = 1
       ORDER BY c.deadline ASC, c.id DESC`
    )
    .all(req.member.id);
  const mine = db
    .prepare('SELECT * FROM contribution_payments WHERE member_id = ?')
    .all(req.member.id);
  const byContribution = new Map(mine.map((row) => [row.contribution_id, row]));
  res.json({
    contributions: rows.map((r) => {
      const row = byContribution.get(r.id);
      return publicContribution(r, row ? mineContribution(r, row) : { state: 'unpaid' });
    }),
  });
});

// Member pastes their confirmation, which moves the payment to 'pending'.
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
  const { error, proof } = readProof(req.body?.proof_message);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `INSERT INTO contribution_payments
       (contribution_id, member_id, status, paid_at,
        proof_message, proof_provider, proof_amount, proof_code,
        proof_date, proof_time, proof_account, proof_received_at)
     VALUES (?, ?, 'pending', datetime('now'), ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(c.id, req.member.id, ...proof);
  const cp = db
    .prepare('SELECT * FROM contribution_payments WHERE contribution_id = ? AND member_id = ?')
    .get(c.id, req.member.id);
  res.json({ ok: true, contribution: publicContribution(c, mineContribution(c, cp)) });
});

// Replace the pasted message while it is still awaiting approval.
app.patch('/api/contributions/:id/proof', requireActiveUser, (req, res) => {
  const c = db
    .prepare('SELECT * FROM contributions WHERE id = ? AND is_active = 1')
    .get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contribution not found' });
  const row = db
    .prepare('SELECT * FROM contribution_payments WHERE contribution_id = ? AND member_id = ?')
    .get(c.id, req.member.id);
  if (!row || row.status !== 'pending') {
    return res.status(400).json({ error: 'There is no pending payment to update' });
  }
  const { error, proof } = readProof(req.body?.proof_message);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE contribution_payments
     SET proof_message = ?, proof_provider = ?, proof_amount = ?, proof_code = ?,
         proof_date = ?, proof_time = ?, proof_account = ?, proof_received_at = datetime('now')
     WHERE id = ?`
  ).run(...proof, row.id);
  const cp = db.prepare('SELECT * FROM contribution_payments WHERE id = ?').get(row.id);
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
          proof: proofSummary(p),
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

app.get('/api/admin/sms/status', requireActiveAdmin, (req, res) => {
  const config = smsConfig();
  res.json({
    provider: "Africa's Talking",
    configured: smsConfigured(),
    environment: config.environment,
    sender_id: config.senderId || null,
    reminder_days: SMS_REMINDER_DAYS,
    next_reminder_date: addDays(kenyaDate(), SMS_REMINDER_DAYS),
  });
});

app.get('/api/admin/sms/reminders', requireActiveAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, m.display_name
       FROM sms_reminders r
       JOIN members m ON m.id = r.member_id
       ORDER BY r.id DESC
       LIMIT 100`
    )
    .all();
  res.json({ reminders: rows });
});

app.post('/api/admin/sms/send', requireActiveAdmin, async (req, res) => {
  if (!smsConfigured()) {
    return res.status(400).json({ error: 'Configure Africa’s Talking credentials before sending reminders' });
  }
  try {
    res.json(await runSmsReminders());
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not run SMS reminders' });
  }
});

const updateSmsDelivery = (body) => {
  const payload = body || {};
  const messageId = String(payload.messageId || payload.message_id || payload.id || '').trim();
  if (!messageId) return { ok: true, matched: false };
  const rawStatus = String(payload.status || payload.deliveryStatus || '').trim();
  const statusCode = Number(payload.statusCode || payload.status_code || 0);
  let status = 'sent';
  if (statusCode >= 400 || /failed|rejected|undeliver|error/i.test(rawStatus)) {
    status = 'failed';
  } else if (/delivered|success/i.test(rawStatus)) {
    status = 'delivered';
  } else if (/queued|pending/i.test(rawStatus)) {
    status = 'queued';
  }
  const error =
    status === 'failed' ? String(payload.failureReason || payload.failure_reason || 'Delivery failed') : null;
  const result = db
    .prepare('UPDATE sms_reminders SET status = ?, error = ? WHERE provider_id = ?')
    .run(status, error, messageId);
  return { ok: true, matched: result.changes > 0 };
};

const smsCallbackAuthorized = (req) => {
  const expected = process.env.AFRICASTALKING_CALLBACK_TOKEN || '';
  if (!expected) return smsConfig().environment !== 'live';
  return req.get('x-callback-token') === expected || req.query.token === expected;
};

app.post('/api/sms/delivery', (req, res) => {
  if (!smsCallbackAuthorized(req)) return res.status(401).json({ error: 'Invalid callback token' });
  res.json(updateSmsDelivery(req.body));
});

// ---- Admin: member management ----

app.post('/api/admin/members', requireActiveAdmin, (req, res) => {
  const { username, password, display_name, bio, phone, role, designation } = req.body || {};
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
  const normalizedPhone = normalizeKenyanPhone(phone);
  if (normalizedPhone === null) {
    return res.status(400).json({ error: 'Enter a valid Kenyan mobile number, e.g. 0712345678' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare(
      'INSERT INTO members (username, password_hash, display_name, bio, phone, role, designation) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      name,
      hash,
      String(display_name).trim(),
      String(bio || '').trim(),
      normalizedPhone,
      targetRole,
      targetDesignation
    );

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

app.patch('/api/admin/members/:id/phone', requireActiveAdmin, (req, res) => {
  const target = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  const normalized = normalizeKenyanPhone(req.body?.phone);
  if (normalized === null) {
    return res.status(400).json({ error: 'Enter a valid Kenyan mobile number, e.g. 0712345678' });
  }
  db.prepare('UPDATE members SET phone = ? WHERE id = ?').run(normalized, target.id);
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(target.id);
  res.json({ member: publicMember(updated) });
});

const MEMBER_STATUSES = ['active', 'suspended', 'expelled'];
const MAX_STATUS_REASON_LENGTH = 500;

const DESIGNATIONS = [
  'Chairman',
  'Vice Chairman',
  'Secretary',
  'Treasurer',
  'Vice Treasurer',
  'Assistant Secretary',
];

// Suspend, expel, or reactivate a member. Accounts are never deleted.
// Suspending or expelling requires a reason: it is stored on the member and
// shown to them the moment they are blocked from signing in.
app.patch('/api/admin/members/:id/status', requireActiveAdmin, (req, res) => {
  const { status, reason } = req.body || {};
  if (!MEMBER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status must be active, suspended or expelled' });
  }
  const note = String(reason || '').trim();
  if (status !== 'active' && !note) {
    return res.status(400).json({ error: 'Please give a reason for suspending or expelling this member' });
  }
  if (note.length > MAX_STATUS_REASON_LENGTH) {
    return res.status(400).json({ error: `The reason must be ${MAX_STATUS_REASON_LENGTH} characters or fewer` });
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
  if (status === 'active') {
    db.prepare("UPDATE members SET status = 'active', status_reason = '' WHERE id = ?").run(target.id);
    // Reactivating resolves any appeal that was still waiting on this member.
    db.prepare(
      "UPDATE appeals SET status = 'approved', response = ?, decided_by = ?, decided_at = datetime('now') WHERE member_id = ? AND status = 'pending'"
    ).run('Your account was reactivated by an administrator.', req.member.id, target.id);
  } else {
    db.prepare('UPDATE members SET status = ?, status_reason = ? WHERE id = ?').run(status, note, target.id);
  }
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(target.id);
  res.json({ member: publicMember(updated) });
});

// ---- Appeals ----
// A suspended or expelled member can ask the admins to review the decision.
// These routes deliberately use requireAuth (not the active gate), since the
// member's own account is not active while an appeal is pending.

const APPEAL_DECISIONS = ['approved', 'declined'];
const MAX_APPEAL_LENGTH = 1000;

const publicAppeal = (a) => ({
  id: a.id,
  member_id: a.member_id,
  message: a.message,
  status: a.status,
  response: a.response || '',
  created_at: a.created_at,
  decided_at: a.decided_at || null,
  display_name: a.display_name,
  username: a.username,
  member_status: a.member_status,
});

app.post('/api/appeals', requireAuth, (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.member.id);
  if (!member) return res.status(401).json({ error: 'Account no longer exists' });
  if (member.status === 'active') {
    return res.status(400).json({ error: 'Your account is active — no appeal is needed.' });
  }
  const message = String(req.body?.message || '').trim();
  if (message.length < 10) {
    return res.status(400).json({ error: 'Please explain your appeal in at least 10 characters' });
  }
  if (message.length > MAX_APPEAL_LENGTH) {
    return res.status(400).json({ error: `Your appeal must be ${MAX_APPEAL_LENGTH} characters or fewer` });
  }
  const pending = db
    .prepare("SELECT id FROM appeals WHERE member_id = ? AND status = 'pending'")
    .get(member.id);
  if (pending) {
    return res.status(409).json({ error: 'You already have an appeal waiting for review.' });
  }
  const info = db.prepare('INSERT INTO appeals (member_id, message) VALUES (?, ?)').run(member.id, message);
  const appeal = db
    .prepare(
      `SELECT a.*, m.display_name, m.username, m.status AS member_status
       FROM appeals a JOIN members m ON m.id = a.member_id WHERE a.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ appeal: publicAppeal(appeal) });
});

app.get('/api/appeals/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM appeals WHERE member_id = ? ORDER BY id DESC')
    .all(req.member.id);
  res.json({ appeals: rows.map(publicAppeal) });
});

app.get('/api/admin/appeals', requireActiveAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, m.display_name, m.username, m.status AS member_status
       FROM appeals a JOIN members m ON m.id = a.member_id
       ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.id DESC`
    )
    .all();
  res.json({ appeals: rows.map(publicAppeal) });
});

// Approving an appeal reactivates the member; declining leaves them blocked.
app.patch('/api/admin/appeals/:id', requireActiveAdmin, (req, res) => {
  const { decision, response } = req.body || {};
  if (!APPEAL_DECISIONS.includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or declined' });
  }
  const appeal = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
  if (appeal.status !== 'pending') {
    return res.status(400).json({ error: 'This appeal has already been decided' });
  }
  const note = String(response || '').trim().slice(0, MAX_APPEAL_LENGTH);
  db.prepare(
    "UPDATE appeals SET status = ?, response = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?"
  ).run(decision, note, req.member.id, appeal.id);
  if (decision === 'approved') {
    db.prepare("UPDATE members SET status = 'active', status_reason = '' WHERE id = ?").run(appeal.member_id);
  }
  const updated = db
    .prepare(
      `SELECT a.*, m.display_name, m.username, m.status AS member_status
       FROM appeals a JOIN members m ON m.id = a.member_id WHERE a.id = ?`
    )
    .get(appeal.id);
  res.json({ appeal: publicAppeal(updated) });
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

startSmsReminderScheduler();

app.listen(PORT, () => console.log(`API server listening on http://localhost:${PORT}`));