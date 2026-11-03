import { useEffect, useRef, useState } from 'react';
import {
  NotebookText,
  CalendarClock,
  CloudUpload,
  Download,
  Eye,
  FileText,
  HardDrive,
  Loader2,
  Trash2,
  TriangleAlert,
  CheckCircle2,
  UserRound,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtBytes, fmtDate, fmtDateShort, todayInKenya } from '../format.js';

const ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 15 * 1024 * 1024;
const isPdf = (minute) =>
  minute &&
  (minute.mime === 'application/pdf' || (minute.name || '').toLowerCase().endsWith('.pdf'));

const monthDay = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { day: '—', month: '' };
  return {
    day: d.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'UTC' }),
    month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
  };
};

const titleFromFile = (file) =>
  String(file?.name || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

const emptyForm = () => ({
  title: '',
  meeting_date: todayInKenya(),
  description: '',
});

export default function Minutes() {
  const { member } = useAuth();
  const isAdmin = member.role === 'admin';

  const [minutes, setMinutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);
  const fileInput = useRef(null);
  const urls = useRef([]);

  const load = async () => {
    const data = await api.minutes();
    setMinutes(data.minutes);
    setError('');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    };
  }, []);

  const change = (e) => setForm((current) => ({ ...current, [e.target.name]: e.target.value }));

  const chooseFile = (next) => {
    if (!next) return;
    setUploadError('');
    setNotice('');
    const ext = (next.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      setUploadError('Only PDF or Word documents (.pdf, .doc, .docx) are allowed.');
      return;
    }
    if (next.size > MAX_BYTES) {
      setUploadError('File is too large — the maximum size is 15 MB.');
      return;
    }
    setFile(next);
    setForm((current) => ({
      ...current,
      title: current.title.trim() ? current.title : titleFromFile(next),
    }));
  };

  const upload = async (e) => {
    e.preventDefault();
    setUploadError('');
    setNotice('');
    if (!file) {
      setUploadError('Choose the minutes document to upload.');
      return;
    }
    if (!form.title.trim()) {
      setUploadError('Give these minutes a title, e.g. “Club AGM meeting — October”.');
      return;
    }
    if (!form.meeting_date) {
      setUploadError('Pick the date the meeting was held.');
      return;
    }
    setUploading(true);
    try {
      const { minute } = await api.uploadMinutes(file, form);
      setNotice(`Minutes published: “${minute.title}”. Members can now view them.`);
      setForm(emptyForm());
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    chooseFile(e.dataTransfer.files?.[0]);
  };

  const view = async (minute) => {
    setBusy({ id: minute.id, action: 'view' });
    setError('');
    try {
      const { blob } = await api.minutesFile(minute.id);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const download = async (minute) => {
    setBusy({ id: minute.id, action: 'download' });
    setError('');
    try {
      const { blob } = await api.minutesFile(minute.id, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = minute.name || 'minutes';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (minute) => {
    if (!window.confirm(`Delete “${minute.title}”? Members will no longer be able to view it.`)) {
      return;
    }
    setBusy({ id: minute.id, action: 'delete' });
    setError('');
    setNotice('');
    try {
      await api.deleteMinutes(minute.id);
      setNotice(`Deleted “${minute.title}”.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const uploadPanel = (
    <form className="card pad wide minutes-upload" onSubmit={upload}>
      <div className="card-title-row" style={{ marginBottom: 16 }}>
        <span className="icon-tile blue">
          <CloudUpload size={18} />
        </span>
        <div>
          <h2>Upload meeting minutes</h2>
          <p className="muted small">
            Publish the minutes as a PDF or Word document. Every active member can view them.
          </p>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="minutes-title">Title</label>
          <input
            id="minutes-title"
            name="title"
            value={form.title}
            onChange={change}
            placeholder="e.g. Club AGM meeting — October"
            maxLength={160}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="minutes-date">Meeting date</label>
          <input
            id="minutes-date"
            name="meeting_date"
            type="date"
            value={form.meeting_date}
            onChange={change}
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="minutes-description">Notes (optional)</label>
        <textarea
          id="minutes-description"
          name="description"
          rows={3}
          maxLength={1000}
          value={form.description}
          onChange={change}
          placeholder="A short summary of what the meeting covered…"
        />
      </div>

      <div
        className={`upload-zone ${dragActive ? 'drag' : ''} ${uploading ? 'busy' : ''}`}
        onClick={() => !uploading && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) fileInput.current?.click();
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => chooseFile(e.target.files?.[0])}
        />
        {uploading ? (
          <>
            <Loader2 size={30} className="spin-ico" />
            <strong>Uploading…</strong>
            <span className="muted small">Publishing the minutes for the group.</span>
          </>
        ) : file ? (
          <>
            <FileText size={30} />
            <strong>{file.name}</strong>
            <span className="muted small">
              {fmtBytes(file.size)} · click to choose a different file
            </span>
          </>
        ) : (
          <>
            <CloudUpload size={30} />
            <strong>Drag &amp; drop the minutes here</strong>
            <span className="muted small">or click to browse — .pdf, .doc or .docx, up to 15 MB</span>
          </>
        )}
      </div>

      {uploadError && (
        <div className="alert error" style={{ marginTop: 14 }}>
          <TriangleAlert size={17} />
          {uploadError}
        </div>
      )}
      {notice && (
        <div className="alert success" style={{ marginTop: 14 }}>
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}

      <div className="minutes-upload-actions">
        <button className="btn" disabled={uploading}>
          {uploading ? <Loader2 size={15} className="spin-ico" /> : <CloudUpload size={15} />}
          {uploading ? 'Publishing…' : 'Publish minutes'}
        </button>
      </div>
    </form>
  );

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>Meeting minutes</h1>
            <p className="page-sub">Loading the group's meeting minutes…</p>
          </div>
        </div>
        <div className="card pad wide">
          <div className="skeleton" style={{ height: 24, width: '35%', marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 160, width: '100%' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Meeting minutes</h1>
          <p className="page-sub">
            {minutes.length === 0
              ? 'The record of what was discussed and agreed at each group meeting.'
              : `${minutes.length} meeting${minutes.length === 1 ? '' : 's'} on record — open or download the minutes below.`}
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <TriangleAlert size={17} />
          {error}
        </div>
      )}

      {isAdmin && uploadPanel}

      <div className="minutes-section-head">
        <h2>{isAdmin ? 'Published minutes' : 'Minutes archive'}</h2>
        <span className="badge member">{minutes.length}</span>
      </div>

      {minutes.length === 0 ? (
        <div className="empty-state wide">
          <div className="icon-tile blue">
            <NotebookText size={22} />
          </div>
          <h3>No minutes yet</h3>
          <p>
            {isAdmin
              ? 'Upload the minutes of your first meeting using the form above.'
              : 'Your admin has not published any meeting minutes yet. They will appear here after each meeting.'}
          </p>
        </div>
      ) : (
        <div className="minutes-list">
          {minutes.map((minute) => {
            const date = monthDay(minute.meeting_date);
            const pdf = isPdf(minute);
            const viewing = busy?.id === minute.id && busy.action === 'view';
            const downloading = busy?.id === minute.id && busy.action === 'download';
            const deleting = busy?.id === minute.id && busy.action === 'delete';
            return (
              <article className="minutes-row" key={minute.id}>
                <div className="minutes-date" aria-hidden="true">
                  <span className="minutes-day">{date.day}</span>
                  <span className="minutes-month">{date.month}</span>
                </div>

                <div className="minutes-main">
                  <div className="minutes-title-row">
                    <strong>{minute.title}</strong>
                    <span className={`file-badge ${pdf ? '' : 'word'}`}>
                      {pdf ? 'PDF' : 'DOC'}
                    </span>
                  </div>
                  {minute.description && <p className="minutes-desc">{minute.description}</p>}
                  <div className="minutes-meta">
                    <span>
                      <CalendarClock size={13} />
                      {fmtDateShort(minute.meeting_date)}
                    </span>
                    <span>·</span>
                    <span>
                      <HardDrive size={13} />
                      {fmtBytes(minute.size)}
                    </span>
                    {minute.uploaded_by_name && (
                      <>
                        <span>·</span>
                        <span>
                          <UserRound size={13} />
                          Uploaded by {minute.uploaded_by_name}
                        </span>
                      </>
                    )}
                    {minute.created_at && (
                      <>
                        <span>·</span>
                        <span>Published {fmtDate(minute.created_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="minutes-actions">
                  {pdf && (
                    <button
                      className="btn sm"
                      onClick={() => view(minute)}
                      disabled={viewing || deleting}
                    >
                      {viewing ? <Loader2 size={14} className="spin-ico" /> : <Eye size={14} />}
                      View
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    onClick={() => download(minute)}
                    disabled={downloading || deleting}
                  >
                    {downloading ? (
                      <Loader2 size={14} className="spin-ico" />
                    ) : (
                      <Download size={14} />
                    )}
                    Download
                  </button>
                  {isAdmin && (
                    <button
                      className="btn danger-ghost sm"
                      onClick={() => remove(minute)}
                      disabled={deleting}
                      title="Delete these minutes"
                    >
                      {deleting ? <Loader2 size={14} className="spin-ico" /> : <Trash2 size={14} />}
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="muted small minutes-footnote">
        <FileText size={13} />
        Minutes are published by the group administration and are available to all active members.
      </p>
    </div>
  );
}
