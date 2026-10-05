import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2, TriangleAlert } from 'lucide-react';

// Downloads one month's payments as a CSV. The month list comes from whatever is
// already loaded on the page, so no extra request is needed to fill the picker.

function monthLabel(period) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function MonthExport({ periods, onDownload, label = 'Download month', filename }) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The month list arrives with the page data, so derive the usable period instead of
  // freezing periods[0] on the first render, when the list is still empty.
  const period = periods.includes(selected) ? selected : periods[0] || '';

  if (!periods.length) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { blob, filename: name } = await onDownload(period);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name || filename || `${period}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking straight after the click can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="month-export">
      <span className="icon-tile green">
        <FileSpreadsheet size={18} />
      </span>
      <div className="month-export-body">
        <strong>Download a month</strong>
        <span className="muted small">
          Spreadsheet with every member's contribution, fines, status and the payment reference they
          submitted — plus any special contributions due that month.
        </span>
        {error && (
          <span className="month-export-error">
            <TriangleAlert size={13} /> {error}
          </span>
        )}
      </div>
      <div className="month-export-actions">
        <select
          value={period}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Month to download"
        >
          {periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </select>
        <button className="btn" onClick={run} disabled={busy || !period}>
          {busy ? <Loader2 size={15} className="spin-ico" style={{ position: 'static' }} /> : <Download size={15} />}
          {label}
        </button>
      </div>
    </div>
  );
}
