import { useEffect, useState } from 'react';
import { UserPlus, Coins, ShieldCheck, Loader2, PauseCircle, UserX, RotateCcw, KeyRound, FileText, Eye, CalendarClock, HardDrive, CloudUpload, LinkIcon, ExternalLink, UserCheck } from 'lucide-react';
import { api } from '../api.js';
import { fmt, currency, fmtBytes, fmtDate } from '../format.js';
import { Avatar } from '../App.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Link } from 'react-router-dom';

const emptyForm = { username: '', password: '', display_name: '', bio: '', role: 'member', designation: '' };

const STATUS_LABEL = { active: 'Active', suspended: 'Suspended', expelled: 'Expelled' };

const DESIGNATIONS = [
  'Chairman',
  'Vice Chairman',
  'Secretary',
  'Treasurer',
  'Vice Treasurer',
  'Assistant Secretary',
];

export default function Admin() {
  const { member: me } = useAuth();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [monthly, setMonthly] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [constitution, setConstitution] = useState(null);
  const [constUrl, setConstUrl] = useState(null);
  const [constBusy, setConstBusy] = useState(false);

  const load = async () => {
    const [{ members }, { monthly_amount }] = await Promise.all([api.members(), api.settings()]);
    setMembers(members);
    setMonthly(monthly_amount);
    const doc = await api.constitution();
    setConstitution(doc);
    if (doc.exists) {
      try {
        const { blob } = await api.constitutionFile();
        setConstUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch {
        setConstUrl(null);
      }
    }
  };

  const viewConstitution = async () => {
    setConstBusy(true);
    try {
      const url =
        constUrl ||
        (await (async () => {
          const { blob } = await api.constitutionFile();
          const u = URL.createObjectURL(blob);
          setConstUrl(u);
          return u;
        })());
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err.message);
    } finally {
      setConstBusy(false);
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const createMember = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      await api.createMember(form);
      setForm(emptyForm);
      setSuccess(`Member "${form.username}" created — share these credentials with them.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.saveSettings({ monthly_amount: Number(monthly) });
      setSuccess('Monthly contribution updated. New months will use this amount.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setRole = async (id, role) => {
    setError('');
    setSuccess('');
    await api.setRole(id, role);
    await load();
  };

  const setDesignation = async (id, designation) => {
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      const { member } = await api.setDesignation(id, designation);
      setSuccess(
        member.designation
          ? `${member.display_name} is now ${member.designation}.`
          : `Designation cleared for ${member.display_name}.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id, status, name) => {
    const action =
      status === 'expelled'
        ? `Expel ${name}? They will no longer access the group. This can be reversed.`
        : status === 'suspended'
          ? `Suspend ${name}? They will not be able to sign in until reactivated.`
          : `Reactivate ${name}?`;
    if (!confirm(action)) return;
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      const { member } = await api.setMemberStatus(id, status);
      setSuccess(
        status === 'expelled'
          ? `${member.display_name} has been expelled.`
          : status === 'suspended'
            ? `${member.display_name} has been suspended.`
            : `${member.display_name} has been reactivated.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Admin dashboard</h1>
          <p className="page-sub">
            Manage accounts, roles, and the monthly contribution setting.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <ShieldCheck size={17} />
          {error}
        </div>
      )}
      {success && (
        <div className="alert success">
          <ShieldCheck size={17} />
          {success}
        </div>
      )}

      <div className="admin-grid">
        <form className="card" onSubmit={createMember}>
          <div className="card-header">
            <div className="card-title-row">
              <span className="icon-tile">
                <UserPlus size={18} />
              </span>
              <div>
                <h2>Add member</h2>
                <p className="muted small">Create an account and share the credentials.</p>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label>Display name</label>
                <input name="display_name" value={form.display_name} onChange={change} placeholder="John Doe" required />
              </div>
              <div className="field">
                <label>Username</label>
                <input name="username" value={form.username} onChange={change} placeholder="johndoe" required />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Password</label>
                <input name="password" type="password" value={form.password} onChange={change} placeholder="Temporary password" required />
              </div>
              <div className="field">
                <label>Role</label>
                <select name="role" value={form.role} onChange={change}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Designation (optional)</label>
              <select name="designation" value={form.designation} onChange={change}>
                <option value="">No designation</option>
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Bio (optional)</label>
              <textarea name="bio" value={form.bio} onChange={change} rows={3} placeholder="A short introduction…" />
            </div>
            <button className="btn" disabled={creating}>
              {creating ? (
                <>
                  <Loader2 size={16} className="spinner" style={{ position: 'static', borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Create member
                </>
              )}
            </button>
          </div>
        </form>

        <form className="card" onSubmit={saveSettings}>
          <div className="card-header">
            <div className="card-title-row">
              <span className="icon-tile green">
                <Coins size={18} />
              </span>
              <div>
                <h2>Monthly contribution</h2>
                <p className="muted small">Default amount every member owes.</p>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="field">
              <label>Amount ({currency})</label>
              <input
                type="number"
                min="0"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                required
              />
            </div>
            <p className="muted small" style={{ marginBottom: 14 }}>
              A payment for the current month is created automatically for every member.
            </p>
            <button className="btn ghost">Save amount</button>
          </div>
        </form>
      </div>

      <div className="card pad wide constitution-root-card">
        <div className="constitution-toolbar" style={{ borderBottom: 'none', padding: 0 }}>
          <div className="card-title-row">
            <span className="icon-tile blue">
              <FileText size={18} />
            </span>
            <div>
              <h2>Constitution</h2>
              <p className="muted small">
                The group's governing document, published on the Constitution page.
              </p>
            </div>
            {constitution?.exists && (
              <span className="badge member" style={{ marginLeft: 'auto' }}>
                Published
              </span>
            )}
          </div>
          {constitution?.exists ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn" onClick={viewConstitution} disabled={constBusy}>
                {constBusy ? <Loader2 size={15} className="spin-ico" /> : <Eye size={15} />}
                View
              </button>
              <Link to="/constitution" className="btn ghost">
                <ExternalLink size={15} />
                Manage
              </Link>
            </div>
          ) : (
            <Link to="/constitution" className="btn">
              <CloudUpload size={15} />
              Upload
            </Link>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          {constitution?.exists ? (
            <div className="file-chip">
              <span className="file-badge">{constitution.mime?.includes('pdf') ? 'PDF' : 'DOC'}</span>
              <div className="file-chip-meta">
                <strong>{constitution.name}</strong>
                <div className="constitution-meta">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CalendarClock size={13} />
                    Updated {fmtDate(constitution.updated_at)}
                  </span>
                  <span>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <HardDrive size={13} />
                    {fmtBytes(constitution.size)}
                  </span>
                  <span>·</span>
                  <span>{constitution.mime?.includes('pdf') ? 'PDF document' : 'Word document'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="alert info" style={{ marginBottom: 0 }}>
              <LinkIcon size={17} />
              No constitution has been uploaded yet. Members will see the Constitution page empty
              until you publish one.
            </div>
          )}
        </div>
      </div>

      <h2 style={{ marginBottom: 16 }}>Manage members ({members.length})</h2>
      <div className="grid">
        {members.map((m) => (
          <div className="card member-card" key={m.id}>
            <div className="member-head">
              <Avatar name={m.display_name} />
              <div>
                <div className="member-name">{m.display_name}</div>
                <div className="member-handle">@{m.username}</div>
              </div>
            </div>
            <div className="badge-row">
              <span className={`badge ${m.role}`}>{m.role}</span>
              {m.designation && <span className="badge designation">{m.designation}</span>}
              {m.status !== 'active' && (
                <span className={`badge role-${m.status}`}>{STATUS_LABEL[m.status]}</span>
              )}
            </div>
            {m.bio && <p className="bio">{m.bio}</p>}
            <div className="actions">
              <select
                value={m.role}
                disabled={busyId === m.id || m.id === me.id}
                onChange={(e) => setRole(m.id, e.target.value)}
                aria-label="Role"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <select
                value={m.designation || ''}
                disabled={busyId === m.id}
                onChange={(e) => setDesignation(m.id, e.target.value)}
                aria-label="Designation"
                title="Committee designation"
              >
                <option value="">No designation</option>
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {busyId === m.id ? (
                <Loader2 size={16} className="spin-ico" style={{ color: 'var(--text-3)' }} />
              ) : m.status === 'active' ? (
                <>
                  <button
                    className="btn ghost-yet sm"
                    disabled={m.id === me.id}
                    title="Temporarily block sign-in"
                    onClick={() => remove(m.id, 'suspended', m.display_name)}
                  >
                    <PauseCircle size={14} />
                    Suspend
                  </button>
                  <button
                    className="btn danger sm"
                    disabled={m.id === me.id}
                    title="Revoke group membership"
                    onClick={() => remove(m.id, 'expelled', m.display_name)}
                  >
                    <UserX size={14} />
                    Expel
                  </button>
                </>
              ) : (
                <button className="btn sm" onClick={() => remove(m.id, 'active', m.display_name)}>
                  <RotateCcw size={14} />
                  Reactivate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="manage-note">
        <KeyRound size={15} />
        Accounts are never deleted. Suspended members can be reactivated; expelled members can be
        brought back at any time from here.
      </div>
    </div>
  );
}