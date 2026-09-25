import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Download,
  Shield,
  CloudUpload,
  Loader2,
  FileUp,
  ExternalLink,
  CalendarClock,
  HardDrive,
  TriangleAlert,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtBytes, fmtDate } from '../format.js';
import { Link } from 'react-router-dom';

const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 15 * 1024 * 1024;
const isPdf = (meta) =>
  meta && (meta.mime === 'application/pdf' || (meta.name || '').toLowerCase().endsWith('.pdf'));

function openUrl(url, name) {
  window.open(url, '_blank', 'noopener');
  void name;
}

export default function Constitution() {
  const { member } = useAuth();
  const isAdmin = member.role === 'admin';

  const [meta, setMeta] = useState(null);
  const [viewState, setViewState] = useState('idle'); // idle | ready | error
  const [viewUrl, setViewUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);
  const fileInput = useRef(null);

  const loadDocument = async () => {
    const data = await api.constitution();
    setMeta(data);
    setError('');
    if (!data.exists) return;
    try {
      const { blob } = await api.constitutionFile();
      setViewState('ready');
      setViewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch {
      setViewState('error');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadDocument();
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setViewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    };
  }, []);

  const upload = async (file) => {
    if (!file) return;
    setUploadMsg('');
    setUploadError('');

    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      setUploadError('Only PDF or Word documents (.pdf, .doc, .docx) are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError('File is too large — the maximum size is 15 MB.');
      return;
    }

    setUploading(true);
    try {
      const res = await api.uploadConstitution(file);
      setUploadMsg(`New constitution published: “${res.name}”. The previous version has been replaced.`);
      await loadDocument();
      if (fileInput.current) fileInput.current.value = '';
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    upload(e.dataTransfer.files?.[0]);
  };

  const view = async () => {
    if (viewUrl) {
      openUrl(viewUrl, meta?.name);
      return;
    }
    try {
      const { blob } = await api.constitutionFile();
      const url = URL.createObjectURL(blob);
      setViewUrl(url);
      openUrl(url, meta?.name);
    } catch (e) {
      setUploadError(e.message);
    }
  };

  const download = async () => {
    setBusyDownload(true);
    try {
      const url =
        viewUrl ||
        (await (async () => {
          const { blob } = await api.constitutionFile();
          const u = URL.createObjectURL(blob);
          setViewUrl(u);
          return u;
        })());
      const a = document.createElement('a');
      a.href = url;
      a.download = meta?.name || 'constitution';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setBusyDownload(false);
    }
  };

  const metaRow = (
    <div className="constitution-meta">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <CalendarClock size={13} />
        Updated {fmtDate(meta?.updated_at)}
      </span>
      <span>·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <HardDrive size={13} />
        {fmtBytes(meta?.size)}
      </span>
      <span>·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <FileText size={13} />
        {meta?.mime?.includes('pdf') ? 'PDF document' : 'Word document'}
      </span>
    </div>
  );

  const documentActions = (
    <div className="page-header-actions">
      {isPdf(meta) && (
        <button className="btn" onClick={view}>
          {viewState === 'ready' || viewUrl ? <Eye size={16} /> : <ExternalLink size={16} />}
          View
        </button>
      )}
      <button className="btn ghost" onClick={download} disabled={busyDownload}>
        {busyDownload ? <Loader2 size={15} className="spin-ico" /> : <Download size={15} />}
        Download
      </button>
    </div>
  );

  const documentCard =
    meta?.exists && viewUrl ? (
      isPdf(meta) ? (
        <div className="card pad wide" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="constitution-toolbar">
            <div className="file-chip">
              <span className="file-badge">PDF</span>
              <div className="file-chip-meta">
                <strong>{meta.name}</strong>
                {metaRow}
              </div>
            </div>
            {documentActions}
          </div>
          {viewState === 'ready' ? (
            <iframe className="pdf-frame" title="Constitution" src={viewUrl} loading="lazy" />
          ) : (
            <div className="upload-zone busy" style={{ cursor: 'default', borderStyle: 'solid', borderRadius: 0 }}>
              <Loader2 size={26} className="spin-ico" />
              <strong>Preparing the document…</strong>
            </div>
          )}
        </div>
      ) : (
        <div className="card pad wide">
          <div className="file-chip" style={{ marginBottom: 20 }}>
            <span className="file-badge word">DOC</span>
            <div className="file-chip-meta">
              <strong>{meta.name}</strong>
              {metaRow}
            </div>
          </div>
          <div className="empty-state" style={{ padding: '34px 24px' }}>
            <div className="icon-tile blue">
              <FileText size={22} />
            </div>
            <h3>Preview not available in the browser</h3>
            <p>Word documents can't be previewed inline — download the file to read it.</p>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={download} disabled={busyDownload}>
                {busyDownload ? <Loader2 size={16} className="spin-ico" /> : <Download size={16} />}
                Download constitution
              </button>
            </div>
          </div>
        </div>
      )
    ) : meta?.exists ? (
      <div className="card pad wide">
        <div className="constitution-toolbar" style={{ borderBottom: 'none', padding: '0 0 16px 0' }}>
          <div className="file-chip">
            <span className="file-badge">{isPdf(meta) ? 'PDF' : 'DOC'}</span>
            <div className="file-chip-meta">
              <strong>{meta.name}</strong>
              {metaRow}
            </div>
          </div>
          {documentActions}
        </div>
        {viewState === 'error' && (
          <div className="alert info" style={{ marginBottom: 0 }}>
            <TriangleAlert size={17} />
            The document is published but the inline preview couldn't load. Use the View or
            Download buttons above to read it.
          </div>
        )}
      </div>
    ) : null;

  const uploadPanel = (
    <div className="card pad wide">
      <div className="card-title-row" style={{ marginBottom: 16 }}>
        <span className="icon-tile">
          <FileUp size={18} />
        </span>
        <div>
          <h2>{meta?.exists ? 'Replace constitution' : 'Upload constitution'}</h2>
          <p className="muted small">
            {meta?.exists
              ? 'The current version will be replaced by the new upload.'
              : 'Publish the group constitution as a PDF or Word document.'}
          </p>
        </div>
        {meta?.exists && (
          <span className="badge member" style={{ marginLeft: 'auto' }}>
            Published
          </span>
        )}
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
          onChange={(e) => upload(e.target.files?.[0])}
        />
        {uploading ? (
          <>
            <Loader2 size={30} className="spin-ico" />
            <strong>Uploading…</strong>
            <span className="muted small">
              Publishing the new document. This replaces the old version.
            </span>
          </>
        ) : (
          <>
            <CloudUpload size={30} />
            <strong>Drag &amp; drop your file here</strong>
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
      {uploadMsg && (
        <div className="alert success" style={{ marginTop: 14 }}>
          <CheckCircle2 size={17} />
          {uploadMsg}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>Constitution</h1>
            <p className="page-sub">Loading the group constitution…</p>
          </div>
        </div>
        <div className="card pad wide">
          <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 340, width: '100%' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Constitution</h1>
          <p className="page-sub">
            {meta?.exists
              ? `The group's governing document — current version “${meta.name}”.`
              : 'The group constitution has not been published yet.'}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {!meta?.exists ? (
        <>
          <div className="empty-state wide" style={{ marginBottom: 24 }}>
            <div className="icon-tile">
              <FileText size={22} />
            </div>
            <h3>No constitution yet</h3>
            <p>
              {isAdmin
                ? 'Upload a PDF or Word document below to publish it for the group.'
                : 'Your admin has not uploaded a constitution yet. This page will show it as soon as it is published.'}
            </p>
          </div>
          {isAdmin && uploadPanel}
        </>
      ) : (
        <>
          {documentCard}
          <div className="constitution-meta" style={{ marginTop: 14 }}>
            <Shield size={13} />
            Published by the group administration
          </div>
          {isAdmin && (
            <>
              <div style={{ margin: '26px 0 14px' }}>
                <h2>Admin</h2>
              </div>
              {uploadPanel}
            </>
          )}
        </>
      )}

      {isAdmin && meta?.exists && (
        <p className="muted small" style={{ marginTop: 18 }}>
          Looking for the admin overview?{' '}
          <Link to="/admin">Open the Admin dashboard</Link>.
        </p>
      )}
    </div>
  );
}