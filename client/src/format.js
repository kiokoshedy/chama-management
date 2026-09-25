export const currency = 'KSh';

export function fmt(n) {
  return `${currency} ${Number(n || 0).toLocaleString('en-KE')}`;
}

export function fmtBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(stamp) {
  if (!stamp) return '—';
  const d = new Date(stamp.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function deadlineDays(deadline) {
  if (!deadline) return null;
  const parsed = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((parsed - today) / 86400000);
}

export function deadlineState(deadline) {
  const days = deadlineDays(deadline);
  if (days === null) return { cls: '', label: '', short: '' };
  if (days < 0) return { cls: 'overdue', label: `Overdue by ${-days} ${-days === 1 ? 'day' : 'days'}`, short: `${-days}d overdue` };
  if (days === 0) return { cls: 'due-soon', label: 'Due today', short: 'Due today' };
  if (days === 1) return { cls: 'due-soon', label: 'Due tomorrow', short: 'Due tomorrow' };
  if (days <= 7) return { cls: 'due-soon', label: `Due in ${days} days — ${fmtDateShort(deadline)}`, short: `${days}d left` };
  return { cls: '', label: `Due ${fmtDateShort(deadline)}`, short: fmtDateShort(deadline) };
}