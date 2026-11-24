import { useEffect, useState } from 'react';
import {
  UserPlus, Coins, ShieldCheck, Loader2, PauseCircle, UserX, RotateCcw,
  KeyRound, FileText, Eye, CalendarClock, HardDrive, CloudUpload, LinkIcon,
  ExternalLink, UserCheck, Phone, X, TriangleAlert, CheckCircle2,
  XCircle, MessageSquareText, NotebookText, HandCoins, Plus, Undo2, ReceiptText,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { api } from '../api.js';
import { fmt, currency, fmtBytes, fmtDate, fmtDateShort } from '../format.js';
import { Avatar } from '../App.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Link } from 'react-router-dom';

const emptyForm = {
  username: '',
  password: '',
  display_name: '',
  bio: '',
  phone: '',
  pending_balance: '',
  pending_fine: '',
  pending_fine_reason: '',
  designation: '',
};

const STATUS_LABEL = { active: 'Active', suspended: 'Suspended', expelled: 'Expelled' };
const APPEAL_LABEL = { pending: 'Pending', approved: 'Approved', declined: 'Declined' };

const DESIGNATIONS = [
  'Chairman',
  'Vice Chairman',
  'Secretary',
  'Treasurer',
  'Vice Treasurer',
  'Assistant Secretary',
];

export default function Admin() {
  const { me } = useAuth();

  const [members, setMembers] = useState([]);
  const [phoneDrafts, setPhoneDrafts] = useState({});
  const [balanceDrafts, setBalanceDrafts] = useState({});
  const [fineDrafts, setFineDrafts] = useState({});
  const [fineReasonDrafts, setFineReasonDrafts] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [monthly, setMonthly] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [constitution, setConstitution] = useState(null);
  const [constUrl, setConstUrl] = useState(null);
  const [constBusy, setConstBusy] = useState(false);
  const [minutes, setMinutes] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [contribForm, setContribForm] = useState({ title: '', description: '', amount: '', deadline: '' });
  const [creatingContrib, setCreatingContrib] = useState(false);
  const [openedContrib, setOpenedContrib] = useState(null);
  const [contribDeadlineDrafts, setContribDeadlineDrafts] = useState({});
  const [busyContribDeadline, setBusyContribDeadline] = useState(null);
  const [contribMsg, setContribMsg] = useState('');
  const [contribErr, setContribErr] = useState('');
  const [busyContrib, setBusyContrib] = useState(null);
  const [proofViewContrib, setProofViewContrib] = useState(null);
  const [appeals, setAppeals] = useState([]);
  const [statusModal, setStatusModal] = useState(null);
  const [reason, setReason] = useState('');
  const [appealModal, setAppealModal] = useState(null);
  const [response, setResponse] = useState('');
  const [modalBusy, setModalBusy] = useState(false);

  const load = async () => {
    const [
      { members },
      { monthly_amount },
      { appeals: appealsList },
      { minutes: minutesList },
      { contributions: contribsList },
    ] = await Promise.all([
      api.members(),
      api.settings(),
      api.adminAppeals(),
      api.minutes(),
      api.adminContributions(),
    ]);

    setMembers(members);
    setPhoneDrafts(Object.fromEntries(members.map((m) => [m.id, m.phone || ''])));
    setBalanceDrafts(Object.fromEntries(members.map((m) => [m.id, m.pending_balance || 0])));
    setFineDrafts(Object.fromEntries(members.map((m) => [m.id, m.pending_fine || 0])));
    setFineReasonDrafts(Object.fromEntries(members.map((m) => [m.id, m.pending_fine_reason || ''])));
    setMonthly(monthly_amount);
    setAppeals(appealsList);
    setMinutes(minutesList);
    setContribs(contribsList);

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
      await api.createMember({ ...form, role: 'member' });
      setForm(emptyForm);
      setSuccess(
        `Member account "${form.username}" created. Share these credentials with them. If you need a separate admin account, create it with a different username.`
      );
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

  const todayInKenyaStr = () => new Date().toISOString().slice(0, 10);

  const createContrib = async (e) => {
    e.preventDefault();
    setContribErr('');
    setContribMsg('');
    setCreatingContrib(true);
    try {
      await api.createContribution({
        title: String(contribForm.title).trim(),
        description: String(contribForm.description || '').trim(),
        amount: Number(contribForm.amount),
        deadline: contribForm.deadline,
      });
      setContribForm({ title: '', description: '', amount: '', deadline: todayInKenyaStr() });
      setContribMsg(`Special contribution “${contribForm.title}” created and visible to every member.`);
      await load();
    } catch (err) {
      setContribErr(err.message);
    } finally {
      setCreatingContrib(false);
    }
  };

  const changeContrib = (e) => setContribForm({ ...contribForm, [e.target.name]: e.target.value });

  const toggleContribActive = async (c) => {
    setContribErr('');
    setContribMsg('');
    setBusyContrib(`t-${c.id}`);
    try {
      await api.updateContribution(c.id, { is_active: !c.is_active });
      setContribMsg(
        c.is_active ? `"${c.title}" is now closed.` : `"${c.title}" is now open.`
      );
      await load();
    } catch (err) {
      setContribErr(err.message);
    } finally {
      setBusyContrib(null);
    }
  };

  const approveContribPayment = async (cid, pid, name) => {
    setContribErr('');
    setContribMsg('');
    setBusyContrib(pid);
    try {
      await api.approveContributionPayment(cid, pid);
      setContribMsg(`${name}'s contribution payment approved.`);
      await load();
    } catch (err) {
      setContribErr(err.message);
    } finally {
      setBusyContrib(null);
    }
  };

  const resetContribPayment = async (cid, pid, name) => {
    setContribErr('');
    setContribMsg('');
    setBusyContrib(pid);
    try {
      await api.resetContributionPayment(cid, pid);
      setContribMsg(`${name}'s contribution payment has been cleared (they can pay again).`);
      await load();
    } catch (err) {
      setContribErr(err.message);
    } finally {
      setBusyContrib(null);
    }
  };

  const saveContribDeadline = async (c) => {
    const value = contribDeadlineDrafts[c.id] || '';
    if (!value) return setContribErr('A contribution deadline is required.');
    setContribErr('');
    setContribMsg('');
    setBusyContribDeadline(c.id);
    try {
      await api.updateContribution(c.id, { deadline: value });
      setContribMsg(`Deadline updated for "${c.title}".`);
      await load();
    } catch (err) {
      setContribErr(err.message);
    } finally {
      setBusyContribDeadline(null);
    }
  };

  const closeProofViewContrib = () => {
    setProofViewContrib(null);
  };

  const setPhone = async (id) => {
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      const { member } = await api.setMemberPhone(id, phoneDrafts[id] || '');
      setSuccess(`Mobile number saved for ${member.display_name}.`);
      setPhoneDrafts((current) => ({ ...current, [id]: member.phone || '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const setBalance = async (id) => {
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      const { member } = await api.setMemberBalance(id, balanceDrafts[id] ?? 0);
      setSuccess(`Previous Arrears saved for ${member.display_name}.`);
      setBalanceDrafts((current) => ({ ...current, [id]: member.pending_balance }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const setFine = async (id) => {
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      const { member } = await api.setMemberFine(
        id,
        fineDrafts[id] ?? 0,
        fineReasonDrafts[id] ?? ''
      );
      setSuccess(
        member.pending_fine > 0
          ? `Fine saved for ${member.display_name}.`
          : `Fine cleared for ${member.display_name}.`
      );
      setFineDrafts((current) => ({ ...current, [id]: member.pending_fine }));
      setFineReasonDrafts((current) => ({ ...current, [id]: member.pending_fine_reason }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const applyStatus = async (id, status, reasonText, name) => {
    setError('');
    setSuccess('');
    setBusyId(id);
    try {
      const { member } = await api.setMemberStatus(id, status, reasonText);
      setSuccess(
        status === 'expelled'
          ? `${member.display_name} has been expelled.`
          : status === 'suspended'
            ? `${member.display_name} has been suspended.`
            : `${member.display_name} has been reactivated.`
      );
      setStatusModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const requestStatus = (id, status, name) => {
    setError('');
    setSuccess('');
    if (status === 'active') {
      if (confirm(`Reactivate ${name}? They will be able to sign in again.`)) {
        applyStatus(id, 'active', '', name);
      }
      return;
    }
    setReason('');
    setStatusModal({ id, status, name });
  };

  const decideAppeal = async (id, decision) => {
    setError('');
    setSuccess('');
    setModalBusy(true);
    try {
      const { appeal } = await api.decideAppeal(id, decision, response);
      setSuccess(
        decision === 'approved'
          ? `Appeal approved — ${appeal.display_name} has been reactivated.`
          : `Appeal declined for ${appeal.display_name}.`
      );
      setAppealModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setModalBusy(false);
    }
  };

  const pendingAppeals = appeals.filter((a) => a.status === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Admin dashboard</h1>
          <p className="page-sub">
            Manage member accounts and portal settings. Admin accounts are separate from group members.
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
                <p className="muted small">
                  Create a member account and share the credentials. Admin accounts are separate and do not take part as group members.
                </p>
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
                <label>Mobile number (optional)</label>
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={change}
                  placeholder="0712345678"
                  autoComplete="tel"
                />
                <span className="field-hint">Shown in the member directory and reports.</span>
              </div>
            </div>
            <div className="field">
              <label>Previous Arrears owed (optional)</label>
              <input
                name="pending_balance"
                type="number"
                min="0"
                step="0.01"
                value={form.pending_balance}
                onChange={change}
                placeholder="0"
              />
              <span className="field-hint">Money this member already owes. Added to their dues in full.</span>
            </div>
            <div className="field">
              <label>Fine (optional)</label>
              <input
                name="pending_fine"
                type="number"
                min="0"
                step="0.01"
                value={form.pending_fine}
                onChange={change}
                placeholder="0"
              />
              <input
                name="pending_fine_reason"
                value={form.pending_fine_reason}
                onChange={change}
                placeholder="Reason (e.g. lateness)"
                aria-label="Reason for fine"
              />
              <span className="field-hint">Fine for this member. Added to their dues in full.</span>
            </div>
            <div className="field">
              <label>Designation (optional)</label>
              <select name="designation" value={form.designation} onChange={change}>
                <option value="">No designation</option>
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
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

      {/* Constitution card */}
      <div className="card pad wide constitution-root-card">
        <div className="constitution-toolbar" style={{ borderBottom: 'none', padding: 0 }}>
          <div className="card-title-row">
            <span className="icon-tile blue">
              <FileText size={18} />
            </span>
            <div>
              <h2>Constitution</h2>
              <p className="muted small">The group's governing document, published on the Constitution page.</p>
            </div>
            {constitution?.exists && (
              <span className="badge member" style={{ marginLeft: 'auto' }}>Published</span>
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
              No constitution has been uploaded yet. Members will see the Constitution page empty until you publish one.
            </div>
          )}
        </div>
      </div>

      {/* Meeting minutes card */}
      <div className="card pad wide minutes-admin-card">
        <div className="card-title-row">
          <span className="icon-tile blue">
            <NotebookText size={18} />
          </span>
          <div>
            <h2>Meeting minutes</h2>
            <p className="muted small">Minutes published to members after each group meeting.</p>
          </div>
          <span className="badge member" style={{ marginLeft: 'auto' }}>
            {minutes.length} published
          </span>
        </div>
        <div style={{ marginTop: 16 }}>
          {minutes.length === 0 ? (
            <div className="alert info" style={{ marginBottom: 0 }}>
              <NotebookText size={17} />
              No minutes have been published yet. Upload the record of your next meeting so members can read it.
            </div>
          ) : (
            <div className="minutes-admin-list">
              {minutes.slice(0, 3).map((minute) => (
                <div className="minutes-admin-row" key={minute.id}>
                  <CalendarClock size={14} />
                  <div>
                    <strong>{minute.title}</strong>
                    <span className="muted small">
                      {fmtDateShort(minute.meeting_date)} · {minute.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Link to="/minutes" className="btn">
              <CloudUpload size={15} />
              {minutes.length === 0 ? 'Upload minutes' : 'Manage minutes'}
            </Link>
          </div>
        </div>
      </div>

      {/* Appeals card */}
      <div className="card pad wide appeals-card">
        <div className="card-title-row">
          <span className="icon-tile amber">
            <MessageSquareText size={18} />
          </span>
          <div>
            <h2>Appeals</h2>
            <p className="muted small">
              Suspended or expelled members can ask for a review. Approving an appeal reactivates the member.
            </p>
          </div>
          {pendingAppeals > 0 && (
            <span className="badge pending" style={{ marginLeft: 'auto' }}>
              {pendingAppeals} pending
            </span>
          )}
        </div>
        {appeals.length === 0 ? (
          <div className="alert info" style={{ marginBottom: 0 }}>
            <MessageSquareText size={17} />
            No appeals have been submitted yet.
          </div>
        ) : (
          <div className="appeal-list">
            {appeals.map((a) => (
              <div className={`appeal-row ${a.status}`} key={a.id}>
                <div className="appeal-row-head">
                  <Avatar name={a.display_name} className="sm" />
                  <div className="appeal-row-who">
                    <strong>{a.display_name}</strong>
                    <span className="muted small">
                      @{a.username} · {fmtDate(a.created_at)}
                    </span>
                  </div>
                  <span className={`badge ${a.status}`}>{APPEAL_LABEL[a.status]}</span>
                </div>
                <p className="appeal-message">{a.message}</p>
                {a.status === 'pending' ? (
                  <div className="appeal-row-actions">
                    <button
                      className="btn danger-ghost sm"
                      onClick={() => {
                        setResponse('');
                        setAppealModal({ id: a.id, decision: 'declined', name: a.display_name });
                      }}
                    >
                      <XCircle size={14} />
                      Decline
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => {
                        setResponse('');
                        setAppealModal({ id: a.id, decision: 'approved', name: a.display_name });
                      }}
                    >
                      <CheckCircle2 size={14} />
                      Approve
                    </button>
                  </div>
                ) : (
                  a.response && (
                    <p className="appeal-response">
                      <MessageSquareText size={13} />
                      {a.response}
                    </p>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Special contributions */}
      <div className="card pad wide contrib-admin-root" style={{ marginBottom: 24 }}>
        <div className="section-head">
          <span className="icon-tile amber">
            <HandCoins size={18} />
          </span>
          <div>
            <h2 className="section-title">Special contributions</h2>
            <p className="muted small">
              One-off collections (weddings, harambees, sick support, functions…). Create one and it
              appears on every member's dashboard with its deadline; approve each member's payment here.
            </p>
          </div>
        </div>

        {contribErr && (
          <div className="alert error" style={{ marginTop: 14 }}>
            <ShieldCheck size={17} />
            {contribErr}
          </div>
        )}
        {contribMsg && (
          <div className="alert success" style={{ marginTop: 14 }}>
            <ShieldCheck size={17} />
            {contribMsg}
          </div>
        )}

        <form className="contrib-create" onSubmit={createContrib} style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>Title</label>
            <input name="title" value={contribForm.title} onChange={changeContrib} placeholder="e.g. John Doe sick. " required />
          </div>
          <div className="field">
            <label>Amount ({currency})</label>
            <input name="amount" type="number" min="1" step="any" value={contribForm.amount} onChange={changeContrib} placeholder="2000" required />
          </div>
          <div className="field">
            <label>Payment deadline</label>
            <input name="deadline" type="date" min={todayInKenyaStr()} value={contribForm.deadline} onChange={changeContrib} required />
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <input name="description" value={contribForm.description} onChange={changeContrib} placeholder="What this collection is for…" />
          </div>
          <button
            className="btn"
            style={{ gridColumn: '1 / -1', alignSelf: 'end' }}
            disabled={creatingContrib}
          >
            {creatingContrib ? (
              <>
                <Loader2 size={16} className="spinner" style={{ position: 'static', borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
                Creating…
              </>
            ) : (
              <>
                <Plus size={16} />
                Create contribution
              </>
            )}
          </button>
        </form>

        {contribs.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 20, padding: '28px 20px' }}>
            <div className="icon-tile">
              <HandCoins size={22} />
            </div>
            <h3>No contributions yet</h3>
            <p>Create the first one above — it will show up on every member's dashboard immediately.</p>
          </div>
        ) : (
          <div className="contrib-admin-list">
            {contribs
              .slice()
              .sort((a, b) => {
                const aa = new Date(a.created_at || 0).getTime();
                const bb = new Date(b.created_at || 0).getTime();
                return bb - aa;
              })
              .map((c) => {
                const isOpen = openedContrib === c.id;
                return (
                  <div className="contrib-admin-card" key={c.id}>
                    <div className="contrib-main">
                      <div className="contrib-title-row">
                        <strong className="contrib-title">{c.title}</strong>
                        <span className={`badge ${c.is_active ? 'member' : 'pending'}`}>
                          {c.is_active ? 'Open' : 'Closed'}
                        </span>
                      </div>
                      {c.description && <p className="muted small contrib-desc">{c.description}</p>}
                      <div className="contrib-meta">
                        <span className="contrib-amount">{fmt(c.amount)}</span>
                        <span className="muted small">
                          {c.stats.approved} approved · {c.stats.pending} awaiting · {c.stats.members} recorded
                        </span>
                      </div>
                      <div className="contrib-deadline-edit">
                        <input
                          type="date"
                          value={contribDeadlineDrafts[c.id] ?? c.deadline}
                          onChange={(e) => setContribDeadlineDrafts((current) => ({ ...current, [c.id]: e.target.value }))}
                          aria-label={`Deadline for ${c.title}`}
                        />
                        <button
                          className="btn ghost sm"
                          disabled={busyContribDeadline === c.id}
                          onClick={() => saveContribDeadline(c)}
                        >
                          {busyContribDeadline === c.id ? <Loader2 size={14} className="spin-ico" /> : 'Save deadline'}
                        </button>
                      </div>
                    </div>
                    <div className="contrib-actions">
                      <button
                        className="btn ghost sm"
                        disabled={busyContrib === `t-${c.id}`}
                        onClick={() => toggleContribActive(c)}
                      >
                        {busyContrib === `t-${c.id}` ? (
                          <Loader2 size={14} className="spin-ico" />
                        ) : c.is_active ? (
                          <Undo2 size={14} />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        {c.is_active ? 'Close' : 'Reopen'}
                      </button>
                      <button className="btn subtle sm" onClick={() => setOpenedContrib(isOpen ? null : c.id)}>
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isOpen ? 'Hide payments' : `Review payments (${c.stats.pending})`}
                      </button>
                    </div>
                    {isOpen &&
                      (c.payments.length === 0 ? (
                        <p className="muted small" style={{ marginTop: 12 }}>
                          No member has reported payment yet.
                        </p>
                      ) : (
                        <div className="contrib-pays">
                          {c.payments.map((p) => (
                            <div className="contrib-pay-row" key={p.id}>
                              <Avatar name={p.display_name} className="sm" />
                              <div className="contrib-pay-member">
                                <strong>{p.display_name}</strong>
                                <span className="muted small">@{p.username}</span>
                              </div>
                              {p.status === 'approved' ? (
                                <span className="approved-tag">
                                  <CheckCircle2 size={14} /> Approved
                                </span>
                              ) : (
                                <span className="badge status-requested">Awaiting approval</span>
                              )}
                              <div className="actions">
                                <button
                                  className="btn ghost sm"
                                  disabled={!p.proof}
                                  title={p.proof ? 'View the payment message this member pasted' : 'No message was pasted'}
                                  onClick={() =>
                                    setProofViewContrib({
                                      title: `${p.display_name}'s payment message`,
                                      subtitle: c.title,
                                      amountDue: Number(c.amount),
                                      proof: p.proof,
                                    })
                                  }
                                >
                                  <ReceiptText size={14} />
                                  Proof
                                </button>
                                {p.status !== 'approved' && (
                                  <button
                                    className="btn sm"
                                    title="Mark as paid"
                                    onClick={() => approveContribPayment(c.id, p.id, p.display_name)}
                                  >
                                    Approve
                                  </button>
                                )}
                                {p.status === 'pending' && (
                                  <button
                                    className="btn sm danger-ghost"
                                    onClick={() => resetContribPayment(c.id, p.id, p.display_name)}
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                );
              })}
          </div>
        )}
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
              <span className="badge member">member</span>
              {m.designation && <span className="badge designation">{m.designation}</span>}
              {m.status !== 'active' && (
                <span className={`badge role-${m.status}`}>{STATUS_LABEL[m.status]}</span>
              )}
            </div>
            {m.status !== 'active' && m.status_reason && (
              <p className="member-status-reason">
                <TriangleAlert size={13} />
                {m.status_reason}
              </p>
            )}
            {m.bio && <p className="bio">{m.bio}</p>}
            <div className="member-phone-edit">
              <Phone size={14} />
              <input
                type="tel"
                value={phoneDrafts[m.id] ?? m.phone ?? ''}
                onChange={(e) => setPhoneDrafts((current) => ({ ...current, [m.id]: e.target.value }))}
                placeholder="No mobile number"
                aria-label={`Mobile number for ${m.display_name}`}
              />
              <button
                className="btn ghost sm"
                disabled={busyId === m.id}
                onClick={() => setPhone(m.id)}
              >
                Save
              </button>
            </div>
            <div className="member-phone-edit member-balance-edit">
              <Coins size={14} />
              <input
                type="number"
                min="0"
                step="0.01"
                value={balanceDrafts[m.id] ?? m.pending_balance ?? 0}
                onChange={(e) => setBalanceDrafts((current) => ({ ...current, [m.id]: e.target.value }))}
                placeholder="Previous Arrears owed"
                title="Money this member already owes — added to their dues in full"
                aria-label={`Previous Arrears for ${m.display_name}`}
              />
              <button
                className="btn ghost sm"
                disabled={busyId === m.id}
                onClick={() => setBalance(m.id)}
              >
                Save
              </button>
            </div>
            <div className="member-phone-edit member-fine-edit">
              <TriangleAlert size={14} />
              <input
                type="number"
                min="0"
                step="0.01"
                value={fineDrafts[m.id] ?? m.pending_fine ?? 0}
                onChange={(e) => setFineDrafts((current) => ({ ...current, [m.id]: e.target.value }))}
                placeholder="Fine"
                title="Fine for this member — added to their dues in full"
                aria-label={`Fine for ${m.display_name}`}
              />
              <input
                value={fineReasonDrafts[m.id] ?? m.pending_fine_reason ?? ''}
                onChange={(e) => setFineReasonDrafts((current) => ({ ...current, [m.id]: e.target.value }))}
                placeholder="Reason (e.g. lateness)"
                aria-label={`Reason for ${m.display_name}'s fine`}
              />
              <button
                className="btn ghost sm"
                disabled={busyId === m.id}
                onClick={() => setFine(m.id)}
              >
                Save
              </button>
            </div>
            <div className="actions">
              <select
                value={m.designation || ''}
                disabled={busyId === m.id}
                onChange={(e) => setDesignation(m.id, e.target.value)}
                aria-label="Designation"
                title="Committee designation"
              >
                <option value="">No designation</option>
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              {busyId === m.id ? (
                <Loader2 size={16} className="spin-ico" style={{ color: 'var(--text-3)' }} />
              ) : m.status === 'active' ? (
                <>
                  <button
                    className="btn ghost-yet sm"
                    title="Temporarily block sign-in"
                    onClick={() => requestStatus(m.id, 'suspended', m.display_name)}
                  >
                    <PauseCircle size={14} />
                    Suspend
                  </button>
                  <button
                    className="btn danger sm"
                    title="Revoke group membership"
                    onClick={() => requestStatus(m.id, 'expelled', m.display_name)}
                  >
                    <UserX size={14} />
                    Expel
                  </button>
                </>
              ) : (
                <button className="btn sm" onClick={() => requestStatus(m.id, 'active', m.display_name)}>
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
        Member accounts are never deleted. Admin accounts are separate from group members; if someone is both, keep two accounts (one admin, one member).
      </div>

      {/* Status modal */}
      {statusModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && !modalBusy && setStatusModal(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Member status">
            <div className="modal-head">
              <span className="icon-tile red">
                <TriangleAlert size={18} />
              </span>
              <div>
                <h2 className="section-title">
                  {statusModal.status === 'expelled' ? 'Expel member' : 'Suspend member'}
                </h2>
                <p className="muted small">
                  {statusModal.name} will be blocked from the portal until they are reactivated.
                </p>
              </div>
              <button
                className="icon-btn"
                onClick={() => setStatusModal(null)}
                disabled={modalBusy}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label htmlFor="status-reason">Reason (shown to the member)</label>
                <textarea
                  id="status-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Repeatedly missing monthly contributions after two reminders."
                  autoFocus
                />
                <span className="field-hint">
                  This appears the moment {statusModal.name} tries to sign in, and they can appeal the decision from there.
                </span>
              </div>
              <div className="modal-actions">
                <button className="btn ghost" onClick={() => setStatusModal(null)} disabled={modalBusy}>
                  Cancel
                </button>
                <button
                  className={`btn ${statusModal.status === 'expelled' ? 'danger' : ''}`}
                  disabled={modalBusy || reason.trim().length < 3}
                  onClick={() => applyStatus(statusModal.id, statusModal.status, reason, statusModal.name)}
                >
                  {modalBusy ? (
                    <Loader2 size={15} className="spin-ico" style={{ position: 'static' }} />
                  ) : statusModal.status === 'expelled' ? (
                    <UserX size={15} />
                  ) : (
                    <PauseCircle size={15} />
                  )}
                  {statusModal.status === 'expelled' ? 'Expel member' : 'Suspend member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Appeal modal */}
      {appealModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && !modalBusy && setAppealModal(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Appeal decision">
            <div className="modal-head">
              <span className={`icon-tile ${appealModal.decision === 'approved' ? 'green' : 'red'}`}>
                {appealModal.decision === 'approved' ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <XCircle size={18} />
                )}
              </span>
              <div>
                <h2 className="section-title">
                  {appealModal.decision === 'approved' ? 'Approve appeal' : 'Decline appeal'}
                </h2>
                <p className="muted small">
                  {appealModal.decision === 'approved'
                    ? `Approve ${appealModal.name}'s appeal? Their account will be reactivated.`
                    : `Decline ${appealModal.name}'s appeal? They will stay blocked.`}
                </p>
              </div>
              <button
                className="icon-btn"
                onClick={() => setAppealModal(null)}
                disabled={modalBusy}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label htmlFor="appeal-response">Message to the member (optional)</label>
                <textarea
                  id="appeal-response"
                  rows={3}
                  maxLength={1000}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder={
                    appealModal.decision === 'approved'
                      ? 'e.g. Please catch up on the outstanding months.'
                      : 'e.g. The committee reviewed this and the decision stands.'
                  }
                />
              </div>
              <div className="modal-actions">
                <button className="btn ghost" onClick={() => setAppealModal(null)} disabled={modalBusy}>
                  Cancel
                </button>
                <button
                  className={`btn ${appealModal.decision === 'declined' ? 'danger' : ''}`}
                  disabled={modalBusy}
                  onClick={() => decideAppeal(appealModal.id, appealModal.decision)}
                >
                  {modalBusy ? (
                    <Loader2 size={15} className="spin-ico" style={{ position: 'static' }} />
                  ) : appealModal.decision === 'approved' ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <XCircle size={15} />
                  )}
                  {appealModal.decision === 'approved' ? 'Approve & reactivate' : 'Decline appeal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contribution payment proof view */}
      {proofViewContrib && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && closeProofViewContrib()}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Payment proof">
            <div className="modal-head">
              <span className="icon-tile blue">
                <ReceiptText size={18} />
              </span>
              <div>
                <h2 className="section-title">{proofViewContrib.title}</h2>
                <p className="muted small">{proofViewContrib.subtitle}</p>
              </div>
              <button className="icon-btn" onClick={closeProofViewContrib} aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              {proofViewContrib.proof && (
                <div className="field">
                  <label>Message from member</label>
                  <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {proofViewContrib.proof.message}
                  </p>
                </div>
              )}
              <div className="modal-actions">
                <button className="btn ghost" onClick={closeProofViewContrib}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}