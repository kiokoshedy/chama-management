export const currency = 'KSh';

export function todayInKenya(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

// "2026-03" -> "Mar 26"
export function monthShort(period) {
  const [year, month] = String(period).split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, 1));
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// "2026-03" -> "March 2026"
export function monthLong(period) {
  const [year, month] = String(period).split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, 1));
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// A short, human "3 hours ago" style stamp for activity feeds.
export function timeAgo(stamp) {
  if (!stamp) return '';
  const d = new Date(String(stamp).replace(' ', 'T') + (String(stamp).includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return '';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.round(months / 12)} year${Math.round(months / 12) === 1 ? '' : 's'} ago`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function deadlineDays(deadline) {
  if (!deadline) return null;
  const parsed = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const [year, month, day] = todayInKenya().split('-').map(Number);
  const today = Date.UTC(year, month - 1, day);
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