// ---- Payment proof parsing ----
// A member pastes the confirmation message they got from M-Pesa or their bank
// (or their banking app) before marking a contribution as paid. The raw text is
// always stored verbatim; this module only produces a best-effort summary so an
// admin can scan the amount, reference code and date without reading every
// message by eye.
//
// Nothing here is trusted. A failed parse never blocks a member from submitting
// their proof — the admin still sees the full message.

export const MIN_PROOF_LENGTH = 12;
export const MAX_PROOF_LENGTH = 2000;

const BANK_NAMES = [
  'equity',
  'kcb',
  'co-op',
  'coop',
  'family',
  'stare',
  'absa',
  'standard chartered',
  'dtb',
  'ncba',
  'i&m',
  'im bank',
  'ecobank',
  'sidian',
  'centum',
  'barclays',
  'consolidated',
];

const PAYMENT_WORDS =
  /\b(confirmed|received|sent|paid|payment|debit|debited|credited|transferred|withdrawal|withdrawn|deposit|successful|success|completed|complete)\b/i;

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const toNumber = (raw) => {
  const value = Number(String(raw).replace(/[,\s]/g, ''));
  return Number.isFinite(value) ? value : null;
};

const pad = (n) => String(n).padStart(2, '0');

const isoDate = (year, month, day) => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

// ---- Provider ----

const MPESA_WORDS = /m[\s-]?p[\s-]?esa|safaricom/i;

const detectProvider = (text) => {
  if (MPESA_WORDS.test(text)) return 'mpesa';
  if (BANK_NAMES.some((name) => new RegExp(`\\b${name}\\b`, 'i').test(text))) return 'bank';
  if (/\bbank\b|\bacct\b|account\s+balance|\bdebit\b|\bcredit\b|\bimps\b|\brtgs\b|\bft\b/i.test(text)) {
    return 'bank';
  }
  return 'unknown';
};

// ---- Amount ----
// Only values that are explicitly tagged with a currency are trusted, otherwise
// the parser would happily read a phone number or a timestamp as an amount.

const CURRENCY_AMOUNT = /(?:ksh|kshs|kes|sh)\s*\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const BALANCE_AMOUNT = /\b(?:account\s+|current\s+|remaining\s+)?(?:balance|bal\.?)\b[^0-9]{0,24}?(?:ksh|kshs|kes|sh)?\s*\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const SPENT_AMOUNT =
  /\b(?:debit|debited|paid|received|sent|transferred|withdrawn|charged|amount|payment|contribution|deposit)\b[^0-9]{0,30}?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;

const spanOf = (match) => [match.index, match.index + match[0].length];

const overlaps = (span, ranges) => ranges.some(([start, end]) => span[0] < end && start < span[1]);

const collect = (text, pattern) => {
  const found = [];
  for (const match of text.matchAll(pattern)) {
    found.push({
      value: toNumber(match[1]),
      span: spanOf(match),
      before: text.slice(Math.max(0, match.index - 60), match.index),
      head: match[0].slice(0, match[0].length - match[1].length),
    });
  }
  return found;
};

const extractAmount = (text) => {
  const balances = collect(text, BALANCE_AMOUNT);
  const tagged = collect(text, CURRENCY_AMOUNT).filter(
    (entry) => entry.value !== null && !overlaps(entry.span, balances.map(({ span }) => span))
  );
  if (tagged.length) return tagged[0].value;

  // No currency symbol anywhere: fall back to a number sitting right after a
  // payment verb ("payment of 2500 received"), ignoring reference codes.
  for (const entry of collect(text, SPENT_AMOUNT)) {
    if (entry.value === null) continue;
    if (/\b(?:ref|reference|code|id|no|number)\b\s*[:#.]?\s*$/i.test(entry.head)) continue;
    return entry.value;
  }
  return null;
};

// ---- Reference / confirmation code ----

const CODE_PATTERNS = [
  /confirmation\s*code\s*[:.]?\s*([A-Z0-9]{4,24})/i,
  /\bref(?:erence)?\s*(?:no\.?|number|#)?\s*[:.]?\s*([A-Z0-9]{4,24})/i,
  /\b(?:transaction|trx)\s*(?:id|number|no)?\s*[:#.]?\s*([A-Z0-9]{5,24})/i,
  /\bwithdraw(?:al)?\s*(?:id)?\s*[:.]?\s*([A-Z0-9]{5,24})/i,
  /\b(FT[A-Z0-9]{6,24})\b/,
  // Safaricom confirmation codes (QJG7X2K9LM) and M-Pesa transaction IDs.
  /\b(Q[A-Z0-9]{7,11})\b/,
  /\b(?:id)\s*[:#]\s*([A-Z0-9]{6,24})\b/i,
];

const extractCode = (text) => {
  for (const pattern of CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].toUpperCase();
  }
  return '';
};

// ---- Date & time ----

const extractDate = (text) => {
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Kenyan confirmations use dd/mm/yyyy; some banks use dd-Mon-yyyy.
  const parts = text.match(/\b(\d{1,2})[\/.-]([A-Za-z]{3,9}|\d{1,2})[\/.-](\d{2,4})\b/);
  if (!parts) return null;
  const day = Number(parts[1]);
  const monthToken = parts[2];
  const month = /^\d+$/.test(monthToken)
    ? Number(monthToken)
    : MONTHS[monthToken.slice(0, 3).toLowerCase()] ?? MONTHS[monthToken.slice(0, 4).toLowerCase()];
  if (!month) return null;
  let year = Number(parts[3]);
  if (year < 100) year += 2000;
  return isoDate(year, month, day);
};

const extractTime = (text) => {
  const match = text.match(/\b(\d{1,2}):([0-5]\d)\s*(am|pm)?/i);
  if (!match) return '';
  const suffix = match[3] ? ` ${match[3].toUpperCase()}` : '';
  return `${pad(match[1])}:${match[2]}${suffix}`;
};

// ---- Account / phone (masked) ----

const extractAccount = (text) => {
  const phone = text.match(/\b(?:\+?254|0)(?:7|1)\d{8}\b/);
  if (phone) return `...${phone[0].slice(-4)}`;
  const account = text.match(
    /\b(?:account|acc(?:ou)?nt)\s*(?:no\.?|number|#)?\s*[:.]?\s*([\dxX* ]{6,20})/i
  );
  if (account) {
    const digits = account[1].replace(/\D/g, '');
    if (digits.length >= 4) return `...${digits.slice(-4)}`;
  }
  return '';
};

// ---- Public API ----

export const PROVIDER_LABELS = {
  mpesa: 'M-PESA',
  bank: 'Bank',
  unknown: 'Not recognised',
};

// Normalises whatever the member pasted: NBSPs and stray spacing out, line
// endings in, length bounded. Returns `{ ok, text }` or `{ ok: false, error }`.
export function cleanProofMessage(value) {
  const text = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length < MIN_PROOF_LENGTH) {
    return {
      ok: false,
      error:
        'Paste the full confirmation message you received — for example the M-Pesa "Confirmed" message or your bank alert.',
    };
  }
  if (text.length > MAX_PROOF_LENGTH) {
    return { ok: false, error: `Keep the message under ${MAX_PROOF_LENGTH} characters.` };
  }
  return { ok: true, text };
}

export function analyzeProof(rawMessage) {
  const raw = String(rawMessage ?? '');
  const flat = raw.replace(/\s+/g, ' ');
  const provider = detectProvider(flat);
  const amount = extractAmount(flat);
  const code = extractCode(flat);
  const date = extractDate(flat);
  const time = extractTime(flat);
  const looksLikePayment = PAYMENT_WORDS.test(flat);

  const warnings = [];
  if (!looksLikePayment) {
    warnings.push('No payment wording found. Check you pasted the confirmation, not a request or reminder.');
  }
  if (amount === null) warnings.push('No amount could be read from this message. The admin will check it manually.');
  if (!code) warnings.push('No reference or confirmation code found.');

  return {
    provider,
    provider_label: PROVIDER_LABELS[provider],
    amount,
    code,
    date: date || null,
    time,
    account: extractAccount(flat),
    looks_like_payment: looksLikePayment,
    warnings,
  };
}
