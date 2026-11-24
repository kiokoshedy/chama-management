import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  XCircle,
  Wallet,
  BadgeCheck,
  Loader2,
  HandCoins,
  Undo2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Plus,
  ShieldCheck,
  ReceiptText,
  Pencil,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../App.jsx';
import { ProofDialog, ProofViewer } from '../ProofDialog.jsx';
import PayDialog from '../PayDialog.jsx';
import FinesManager from '../FinesManager.jsx';
import MonthExport from '../MonthExport.jsx';
import { fmt, fmtDateShort, currency, deadlineState, todayInKenya } from '../format.js';

const CONTRIB_FORM = { title: '', description: '', amount: '', deadline: '' };

function ContribDeadlineChip({ deadline }) {
  const ds = deadlineState(deadline);
  return (
    <span className={`deadline-chip ${ds.cls}`}>
      <CalendarClock size={13} />
      {ds.label}
    </span>
  );
}

function ContributionsAdmin() {
  const [contribs, setContribs] = useState([]);
  const [form, setForm] = useState(CONTRIB_FORM);
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState(null);
  const [deadlineDrafts, setDeadlineDrafts] = useState({});
  const [busyDeadline, setBusyDeadline] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [proofView, setProofView] = useState(null);

  const load = async () => {
    const { contributions } = await api.adminContributions();
    setContribs(contributions);
    setDeadlineDrafts(Object.fromEntries(contributions.map((c) => [c.id, c.deadline || ''])));
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!form.deadline) return setErr('Pick a payment deadline for this contribution.');
    setCreating(true);
    try {
      await api.createContribution({
        title: form.title,
        description: form.description,
        amount: Number(form.amount),
        deadline: form.deadline,
      });
      setForm(CONTRIB_FORM);
      setMsg(`Contribution created and now visible on every member's dashboard.`);
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c) => {
    setErr('');
    setMsg('');
    setBusy(`t-${c.id}`);
    try {
      await api.updateContribution(c.id, { is_active: !c.is_active });
      setMsg(c.is_active ? `"${c.title}" is now closed.` : `"${c.title}" is now open.`);
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(null);
    }
  };

  const approve = async (cid, pid, name) => {
    setErr('');
    setMsg('');
    setBusy(pid);
    try {
      await api.approveContributionPayment(cid, pid);
      setMsg(`${name}'s contribution payment approved.`);
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async (cid, pid, name) => {
    setErr('');
    setMsg('');
    setBusy(pid);
    try {
      await api.resetContributionPayment(cid, pid);
      setMsg(`${name}'s contribution payment has been cleared (they can pay again).`);
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(null);
    }
  };

  const saveDeadline = async (c) => {
    const value = deadlineDrafts[c.id] || '';
    if (!value) return setErr('A contribution deadline is required.');
    setErr('');
    setMsg('');
    setBusyDeadline(c.id);
    try {
      await api.updateContribution(c.id, { deadline: value });
      setMsg(`Deadline updated for "${c.title}".`);
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusyDeadline(null);
    }
  };

  const today = todayInKenya();

  return (
    <div className="card pad wide contrib-admin-root" style={{ marginBottom: 28 }}>
      <div className="section-head">
        <span className="icon-tile amber">
          <HandCoins size={18} />
        </span>
        <div>
          <h2 className="section-title">Special contributions</h2>
          <p className="muted small">
            One-off collections (weddings, harambees, functions…). Create one and it appears on
            every member's dashboard with its deadline; you approve each member's payment here.
          </p>
        </div>
      </div>

      {err && (
        <div className="alert error" style={{ marginTop: 14 }}>
          <ShieldCheck size={17} />
          {err}
        </div>
      )}
      {msg && (
        <div className="alert success" style={{ marginTop: 14 }}>
          <ShieldCheck size={17} />
          {msg}
        </div>
      )}

      <form className="contrib-create" onSubmit={create} style={{ marginTop: 18 }}>
        <div className="field" style={{ gridArea: 'title' }}>
          <label>Title</label>
          <input name="title" value={form.title} onChange={change} placeholder="e.g. Wedding gift for Shady." required />
        </div>
        <div className="field" style={{ gridArea: 'amount' }}>
          <label>Amount ({currency})</label>
          <input name="amount" type="number" min="1" step="any" value={form.amount} onChange={change} placeholder="5000" required />
        </div>
        <div className="field" style={{ gridArea: 'deadline' }}>
          <label>Payment deadline</label>
          <input name="deadline" type="date" min={today} value={form.deadline} onChange={change} required />
        </div>
        <div className="field" style={{ gridArea: 'desc' }}>
          <label>Description (optional)</label>
          <input name="description" value={form.description} onChange={change} placeholder="What this collection is for…" />
        </div>
        <button className="btn" style={{ gridArea: 'submit', alignSelf: 'end' }} disabled={creating}>
          {creating ? <Loader2 size={16} className="spin-ico" style={{ position: 'static' }} /> : <Plus size={16} />}
          Create contribution
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
          {contribs.map((c) => {
            const isOpen = opened === c.id;
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
                    <ContribDeadlineChip deadline={c.deadline} />
                    <span className="muted small">
                      {c.stats.approved} approved · {c.stats.pending} awaiting · {c.stats.members} recorded
                    </span>
                  </div>
                  <div className="contrib-deadline-edit">
                    <input
                      type="date"
                      value={deadlineDrafts[c.id] ?? c.deadline}
                      onChange={(e) => setDeadlineDrafts((current) => ({ ...current, [c.id]: e.target.value }))}
                      aria-label={`Deadline for ${c.title}`}
                    />
                    <button
                      className="btn ghost sm"
                      disabled={busyDeadline === c.id}
                      onClick={() => saveDeadline(c)}
                    >
                      {busyDeadline === c.id ? <Loader2 size={14} className="spin-ico" /> : 'Save deadline'}
                    </button>
                  </div>
                </div>
                <div className="contrib-actions">
                  <button
                    className="btn ghost sm"
                    disabled={busy === `t-${c.id}`}
                    onClick={() => toggleActive(c)}
                  >
                    {busy === `t-${c.id}` ? (
                      <Loader2 size={14} className="spin-ico" />
                    ) : c.is_active ? (
                      <Undo2 size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    {c.is_active ? 'Close' : 'Reopen'}
                  </button>
                  <button className="btn subtle sm" onClick={() => setOpened(isOpen ? null : c.id)}>
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
                          ) : p.status === 'partial' ? (
                            <span className="badge status-partial">Part paid</span>
                          ) : (
                            <span className="badge status-requested">Awaiting approval</span>
                          )}
                          <div className="actions">
                            <button
                              className="btn ghost sm"
                              disabled={!p.proof}
                              title={p.proof ? 'View the payment message this member pasted' : 'No message was pasted'}
                              onClick={() => setProofView({
                                title: `${p.display_name}'s payment message`,
                                subtitle: c.title,
                                amountDue: Number(c.amount),
                                proof: p.proof,
                              })}
                            >
                              <ReceiptText size={14} />
                              Proof
                            </button>
                            {p.status === 'pending' && (
                              <button
                                className="btn sm"
                                disabled={busy === p.id}
                                onClick={() => approve(c.id, p.id, p.display_name)}
                              >
                                {busy === p.id ? <Loader2 size={14} className="spin-ico" /> : <BadgeCheck size={14} />}
                                Approve
                              </button>
                            )}
                            <button
                              className="btn ghost sm"
                              disabled={busy === p.id}
                              onClick={() => reset(c.id, p.id, p.display_name)}
                            >
                              <Undo2 size={14} />
                              Reset
                            </button>
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

      {proofView && (
        <ProofViewer
          title={proofView.title}
          subtitle={proofView.subtitle}
          amountDue={proofView.amountDue}
          proof={proofView.proof}
          onClose={() => setProofView(null)}
        />
      )}
    </div>
  );
}

const statusBadge = (s) => (
  <span className={`badge status-${s}`}>
    {s === 'paid' ? 'Paid' : s === 'requested' ? 'Awaiting approval' : s === 'partial' ? 'Part paid' : 'Unpaid'}
  </span>
);

const contribStatus = (state) => (
  <span className={`badge status-${state === 'approved' ? 'paid' : state === 'pending' ? 'requested' : state === 'partial' ? 'partial' : 'unpaid'}`}>
    {state === 'approved' ? 'Approved' : state === 'pending' ? 'Awaiting approval' : state === 'partial' ? 'Part paid' : 'Not paid'}
  </span>
);

function requestItemResult(request, item) {
  if (request.status === 'requested') return { label: 'Pending approval', cls: 'pending' };
  if (request.status === 'rejected') return { label: 'Not applied', cls: 'rejected' };
  if (item.status === 'paid') return { label: 'Paid', cls: 'paid' };
  if (Number(item.balance) > 0) {
    return {
      label: `${fmt(item.balance)} left`,
      cls: item.status === 'partial' ? 'partial' : 'unpaid',
    };
  }
  return { label: 'Paid', cls: 'paid' };
}

function ContribDeadline({ deadline }) {
  const ds = deadlineState(deadline);
  return (
    <span className={`deadline-chip ${ds.cls}`}>
      <CalendarClock size={13} />
      {ds.label}
    </span>
  );
}

function MemberContribs({ contribs, busyId, onPay, onPayRest, onCancel, onEditProof, onViewProof }) {
  if (!contribs.length) return null;
  return (
    <div className="contrib-section">
      <div className="section-head">
        <div>
          <h2 className="section-title">Special contributions</h2>
          <p className="muted small">
            One-off collections set by your admin for specific events — each has its own deadline.
          </p>
        </div>
      </div>
      <div className="contrib-list">
        {contribs.map((c) => (
          <div className="card pad contrib-row" key={c.id}>
            <div className="contrib-main">
              <div className="contrib-title-row">
                <strong className="contrib-title">{c.title}</strong>
                {contribStatus(c.mine?.state)}
              </div>
              {c.description && <p className="muted small contrib-desc">{c.description}</p>}
              <div className="contrib-meta">
                <span className={`contrib-amount ${c.mine?.state !== 'approved' && deadlineState(c.deadline).cls === 'overdue' ? 'overdue-amount' : ''}`}>
                  {fmt(c.amount)}
                </span>
                {c.mine?.state !== 'approved' && <ContribDeadline deadline={c.deadline} />}
              </div>
              {c.mine?.proof && (
                <div className="proof-tag">
                  <ReceiptText size={13} />
                  Message sent{c.mine.proof.code ? ` · Ref ${c.mine.proof.code}` : ''}
                  {c.mine.proof.amount != null && <> · {fmt(c.mine.proof.amount)}</>}
                </div>
              )}
            </div>
            <div className="contrib-actions">
              {c.mine?.state === 'unpaid' && (
                <button className="btn sm" disabled={busyId === c.id} onClick={() => onPay(c)}>
                  {busyId === c.id ? (
                    <Loader2 size={14} className="spin-ico" style={{ position: 'static' }} />
                  ) : (
                    <BadgeCheck size={14} />
                  )}
                  Pay now
                </button>
              )}
              {c.mine?.state === 'pending' && (
                <div className="contrib-await">
                  <span className="muted small">Awaiting approval</span>
                  <button className="btn sm ghost" onClick={() => onViewProof(c)} title="View the message you sent">
                    <ReceiptText size={14} />
                    View
                  </button>
                  <button className="btn sm ghost" onClick={() => onEditProof(c)} title="Paste a different message">
                    <Pencil size={14} />
                    Change
                  </button>
                  <button className="btn sm ghost" disabled={busyId === c.id} onClick={() => onCancel(c.id)}>
                    <Undo2 size={14} />
                    Undo
                  </button>
                </div>
              )}
              {c.mine?.state === 'partial' && (
                <button className="btn sm" onClick={() => onPayRest(c)}>
                  <Wallet size={14} />
                  Pay the rest
                </button>
              )}
              {c.mine?.state === 'approved' && (
                <span className="approved-tag">
                  <CheckCircle2 size={15} />
                  Approved
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Payments() {
  const { member } = useAuth();
  return member.role === 'admin' ? <AdminPayments /> : <MemberPayments />;
}

function MemberPayments() {
  const { member, refresh } = useAuth();
  const [payments, setPayments] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [fines, setFines] = useState([]);
  const [pendingItems, setPendingItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [paySelection, setPaySelection] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [proofForm, setProofForm] = useState(null);
  const [proofError, setProofError] = useState('');
  const [proofBusy, setProofBusy] = useState(false);
  const [proofView, setProofView] = useState(null);

  const load = async () => {
    const [{ payments }, { contributions }, { fines: ownFines }, { items }, { requests: ownRequests }] =
      await Promise.all([
        api.paymentsMe(),
        api.contributions(),
        api.myFines(),
        api.paymentsPending(),
        api.myPaymentRequests(),
      ]);
    setPayments(payments);
    setContribs(contributions);
    setFines(ownFines);
    setPendingItems(items);
    setRequests(ownRequests);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  // Part payments must go through PayDialog so the amount sent is recorded.
  // The old "I have paid" buttons had no amount field and cleared whole rows.
  const openPayFor = (item) => setPaySelection({ initialKeys: item ? [item.key] : [] });

  // ---- Monthly contributions ----

  const askMonthlyProof = (payment, mode = 'request') => {
    setError('');
    setProofError('');
    setProofForm({
      kind: 'monthly',
      mode,
      id: payment.id,
      amountDue: payment.total,
      title: mode === 'request' ? `Monthly contribution · ${payment.period}` : 'Change your payment message',
      subtitle:
        mode === 'request'
          ? 'Paste the confirmation message from M-Pesa or your bank so the admin can verify it.'
          : 'Paste the confirmation message again — this replaces the one the admin has.',
      initialMessage: payment.proof?.message || '',
    });
  };

  // ---- Combined payment requests ----

  const askRequestProof = (request) => {
    setError('');
    setProofError('');
    setProofForm({
      kind: 'request',
      mode: 'proof',
      id: request.id,
      amountDue: Number(request.amount),
      title: `Change message · ${fmt(request.amount)} request`,
      subtitle: 'Paste the confirmation message again — this replaces the one the admin has.',
      initialMessage: request.proof?.message || '',
    });
  };

  const cancelRequest = async (id) => {
    setError('');
    setBusyId(`request-${id}`);
    try {
      await api.cancelPaymentRequest(id);
      await load();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  // ---- Special contributions ----

  const askContribProof = (contribution, mode = 'pay') => {
    setError('');
    setProofError('');
    setProofForm({
      kind: 'contribution',
      mode,
      id: contribution.id,
      amountDue: Number(contribution.amount),
      title: mode === 'pay' ? contribution.title : `Change message · ${contribution.title}`,
      subtitle:
        mode === 'pay'
          ? 'Paste the confirmation message from M-Pesa or your bank so the admin can verify it.'
          : 'Paste the confirmation message again — this replaces the one the admin has.',
      initialMessage: contribution.mine?.proof?.message || '',
    });
  };

  const submitProof = async (message) => {
    setProofBusy(true);
    setProofError('');
    try {
      const { kind, mode, id } = proofForm;
      if (kind === 'request') {
        await api.updatePaymentRequestProof(id, message);
      } else if (kind === 'monthly') {
        if (mode === 'request') await api.requestPayment(id, message);
        else await api.updatePaymentProof(id, message);
      } else if (mode === 'pay') {
        await api.payContribution(id, message);
      } else {
        await api.updateContributionProof(id, message);
      }
      setProofForm(null);
      await load();
    } catch (e) {
      setProofError(e.message);
    } finally {
      setProofBusy(false);
    }
  };

  const closeProof = () => {
    setProofForm(null);
    setProofError('');
  };

  const cancel = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await api.cancelContribution(id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const paid = payments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const unpaid = payments.filter((p) => Number(p.balance) > 0).length;
  const unpaidAmount = payments.reduce((sum, p) => sum + Number(p.balance || 0), 0);
  const pendingBalance = Number(member.pending_balance || 0);
  const pendingFine = Number(member.pending_fine || 0);
  const openContribsOwed = contribs.filter(
    (c) => c.is_active !== false && c.mine?.state !== 'approved'
  );
  const contribOutstanding = openContribsOwed.reduce(
    (sum, c) => sum + Number(c.mine?.balance ?? c.amount ?? 0),
    0
  );
  const totalOutstanding =
    unpaidAmount + pendingBalance + pendingFine + contribOutstanding;
  const outstandingParts = [];
  if (unpaid > 0) outstandingParts.push(`Dues (${unpaid})`);
  if (pendingBalance > 0) outstandingParts.push('Previous Arrears');
  if (pendingFine > 0) outstandingParts.push('Fines');
  if (contribOutstanding > 0) outstandingParts.push('open contributions');
  const outstandingHint = outstandingParts.length
    ? outstandingParts.join(' + ')
    : 'Everything is fully paid';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My payments</h1>
          <p className="page-sub">
            Welcome, {member.display_name}. Choose what you owe, pay any or all of it, and paste the
            M-Pesa or Bank confirmation message — the admin checks it before approving.
          </p>
        </div>
        <button className="btn" onClick={() => openPayFor(null)}>
          <Wallet size={16} />
          Pay now
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total contributed</span>
            <span className="icon-tile">
              <Wallet size={18} />
            </span>
          </div>
          <span className="stat-value">{fmt(paid)}</span>
          <span className="stat-hint">Including part payments</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Outstanding</span>
            <span className="icon-tile amber">
              <Clock3 size={18} />
            </span>
          </div>
          <span className="stat-value">{fmt(totalOutstanding)}</span>
          <span className="stat-hint">{outstandingHint}</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Previous Arrears</span>
            <span className="icon-tile blue">
              <HandCoins size={18} />
            </span>
          </div>
          <span className="stat-value">{fmt(pendingBalance)}</span>
          <span className="stat-hint">Carried over · included in what you owe</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Fine</span>
            <span className="icon-tile amber">
              <TriangleAlert size={18} />
            </span>
          </div>
          <span className="stat-value">{fmt(pendingFine)}</span>
          <span className="stat-hint">
            {member.pending_fine_reason
              ? `${member.pending_fine_reason} · in Outstanding`
              : 'Added to what you owe'}
          </span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Special Contribution Arrears</span>
            <span className="icon-tile violet">
              <HandCoins size={18} />
            </span>
          </div>
          <span className="stat-value">{fmt(contribOutstanding)}</span>
          <span className="stat-hint">
            {openContribsOwed.length} not approved · in Outstanding
          </span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card pad wide my-requests-card" style={{ marginBottom: 24 }}>
        <div className="section-head">
          <span className="icon-tile blue">
            <ReceiptText size={18} />
          </span>
          <div>
            <h2 className="section-title">My payment requests</h2>
            <p className="muted small">
              Each request shows exactly what you paid for. Once approved, the items it settled are
              marked paid and any unpaid balance stays on the specific dues it belongs to.
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <p className="muted small" style={{ marginTop: 14 }}>
            You have not sent a combined payment request yet. Use <strong>Pay now</strong> above to
            settle one or several amounts.
          </p>
        ) : (
          <div className="my-request-list" style={{ marginTop: 14 }}>
            {requests.map((r) => {
              const remaining = r.items.reduce(
                (sum, item) => sum + Math.max(0, Number(item.balance) || 0),
                0
              );
              return (
                <div className="my-request-row" key={r.id}>
                  <div className="my-request-top">
                    <div className="request-title-row">
                      <strong>{fmt(r.amount)} sent</strong>
                      <span className={`badge status-${r.status === 'paid' ? 'paid' : r.status === 'requested' ? 'requested' : 'rejected'}`}>
                        {r.status === 'paid'
                          ? 'Approved'
                          : r.status === 'requested'
                            ? 'Awaiting approval'
                            : 'Rejected'}
                      </span>
                    </div>
                    <span className="muted small">
                      {fmtDateShort(String(r.requested_at).slice(0, 10))} · {r.items.length}{' '}
                      {r.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="request-items">
                    {r.items.map((item) => {
                      const result = requestItemResult(r, item);
                      return (
                        <span className="request-item" key={item.id}>
                          <span>
                            {item.label} <strong>{fmt(item.amount)}</strong>
                          </span>
                          <span className={`request-item-result ${result.cls}`}>{result.label}</span>
                        </span>
                      );
                    })}
                  </div>
                  {r.status === 'paid' && (
                    <div className="my-request-summary">
                      <span>
                        {remaining > 0
                          ? `Still outstanding on these items: ${fmt(remaining)}`
                          : 'All items in this request are fully paid.'}
                      </span>
                    </div>
                  )}
                  <div className="actions">
                    {r.proof?.message && (
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setProofView({
                            title: `Your payment message · ${fmt(r.amount)}`,
                            subtitle: `Request ${r.id}`,
                            amountDue: Number(r.amount),
                            proof: r.proof,
                          })
                        }
                      >
                        <ReceiptText size={14} />
                        View proof
                      </button>
                    )}
                    {r.status === 'requested' && (
                      <>
                        <button
                          className="btn ghost sm"
                          onClick={() => askRequestProof(r)}
                          title="Paste a different message"
                        >
                          <Pencil size={14} />
                          Change message
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={busyId === `request-${r.id}`}
                          onClick={() => cancelRequest(r.id)}
                        >
                          <Undo2 size={14} />
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fines.length > 0 && (
        <div className="card pad wide" style={{ marginBottom: 24 }}>
          <div className="section-head">
            <span className="icon-tile amber">
              <TriangleAlert size={18} />
            </span>
            <div>
              <h2 className="section-title">Fines</h2>
              <p className="muted small">
                Given for a specific reason. Use “Pay now” to settle one, several, or part of them.
              </p>
            </div>
          </div>
          <div className="fines-list" style={{ marginTop: 14 }}>
            {fines.map((fine) => (
              <div className="fine-row" key={fine.id}>
                <div className="fine-row-copy">
                  <strong>{fine.reason || 'Fine'}</strong>
                  <span className="muted small">
                    Added {new Date(String(fine.created_at).replace(' ', 'T')).toLocaleDateString('en-GB')}
                  </span>
                </div>
                <span className="fine-row-amount">
                  <strong>{fmt(fine.amount)}</strong>
                  {fine.status !== 'unpaid' && (
                    <span className="muted small">
                      {fine.status === 'paid' ? 'Paid in full' : `${fmt(fine.amount_paid)} paid`}
                    </span>
                  )}
                </span>
                <span className={`badge status-${fine.status}`}>
                  {fine.status === 'paid' ? 'Paid' : fine.status === 'partial' ? 'Part paid' : 'Unpaid'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MemberContribs
        contribs={contribs}
        busyId={busyId}
        onPay={(c) => openPayFor(pendingItems.find((i) => i.type === 'contribution' && i.id === c.id))}
        onPayRest={(c) => openPayFor(pendingItems.find((i) => i.type === 'contribution' && i.id === c.id))}
        onCancel={cancel}
        onEditProof={(c) => askContribProof(c, 'proof')}
        onViewProof={(c) =>
          setProofView({
            title: c.title,
            subtitle: 'The message you sent to the admin',
            amountDue: Number(c.amount),
            proof: c.mine.proof,
          })
        }
      />

      <div className="section-head" style={{ marginTop: contribs.length ? 30 : 0 }}>
        <div>
          <h2 className="section-title">Monthly contributions</h2>
          <p className="muted small">Your recurring monthly contribution history.</p>
        </div>
      </div>

      <MonthExport
        periods={[...new Set(payments.map((p) => p.period))]}
        onDownload={api.exportMyMonth}
        label="Download my record"
      />

      {payments.length === 0 && !error ? (
        <div className="empty-state">
          <div className="icon-tile">
            <Wallet size={22} />
          </div>
          <h3>No payments yet</h3>
          <p>Your contribution history will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Due date</th>
                <th>Contribution</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="badge pending" style={{ textTransform: 'none' }}>{p.period}</span>
                  </td>
                  <td>
                    {p.due_date ? (
                      <span className="due-date-label">
                        <CalendarClock size={13} />
                        {p.due_date}
                      </span>
                    ) : (
                      <span className="muted">Not set</span>
                    )}
                  </td>
                  <td>{fmt(p.amount)}</td>
                  <td>{fmt(p.amount_paid || 0)}</td>
                  <td>
                    <strong className={Number(p.balance) > 0 ? 'fine-amount' : ''}>
                      {fmt(p.balance ?? p.total)}
                    </strong>
                  </td>
                  <td>{statusBadge(p.status)}</td>
                  <td>
                    {p.proof && (
                      <div className="proof-tag">
                        <ReceiptText size={13} />
                        Message sent
                        {p.proof.amount != null && <> · {fmt(p.proof.amount)}</>}
                        {p.proof.code && <> · Ref {p.proof.code}</>}
                      </div>
                    )}
                    <div className="actions">
                      {(p.status === 'unpaid' || p.status === 'partial') && (
                        <button
                          className="btn subtle sm"
                          onClick={() => openPayFor(pendingItems.find((i) => i.type === 'monthly' && i.id === p.id))}
                        >
                          <BadgeCheck size={14} />
                          {p.status === 'partial' ? 'Pay the rest' : 'Pay now'}
                        </button>
                      )}
                      {p.status === 'requested' && (
                        <>
                          <span className="muted small">Awaiting approval</span>
                          <button
                            className="btn sm ghost"
                            onClick={() => askMonthlyProof(p, 'proof')}
                            title="Paste a different message"
                          >
                            <Pencil size={14} />
                            Change message
                          </button>
                        </>
                      )}
                      {p.status === 'paid' && (
                        <span className="muted small" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
                          <CheckCircle2 size={14} style={{ verticalAlign: 'text-bottom' }} /> Recorded
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paySelection && (
        <PayDialog
          items={pendingItems}
          initialKeys={paySelection.initialKeys}
          onClose={() => setPaySelection(null)}
          onPaid={async () => {
            setPaySelection(null);
            await load();
            await refresh();
          }}
        />
      )}

      {proofForm && (
        <ProofDialog
          title={proofForm.title}
          subtitle={proofForm.subtitle}
          amountDue={proofForm.amountDue}
          initialMessage={proofForm.initialMessage}
          busy={proofBusy}
          error={proofError}
          onCancel={closeProof}
          onSubmit={submitProof}
        />
      )}

      {proofView && (
        <ProofViewer
          title={proofView.title}
          subtitle={proofView.subtitle}
          amountDue={proofView.amountDue}
          proof={proofView.proof}
          onClose={() => setProofView(null)}
        />
      )}
    </div>
  );
}

function AdminPayments() {
  const { refresh } = useAuth();
  const [payments, setPayments] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [dueDates, setDueDates] = useState({});
  const [busyDueId, setBusyDueId] = useState(null);
  const [busyRequest, setBusyRequest] = useState(null);
  const [error, setError] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [proofView, setProofView] = useState(null);

  const load = async () => {
    const [{ payments: rows, filters }, membersList, { requests: requestRows }] = await Promise.all([
      api.adminPayments(),
      api.members(),
      api.adminPaymentRequests(),
    ]);
    setPayments(rows);
    setMembers(membersList.members);
    setRequests(requestRows);
    setFilterPeriod(filters?.period || '');
    setFilterMember(filters?.member_id != null ? String(filters.member_id) : '');
    setDueDates(Object.fromEntries(rows.map((p) => [p.id, p.due_date || ''])));
  };

  const reload = async () => {
    await load();
    await refresh();
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const applyFilters = async () => {
    const qs = new URLSearchParams();
    if (filterMember) qs.set('member_id', filterMember);
    if (filterPeriod) qs.set('period', filterPeriod);
    const { payments: rows, filters } = await api.adminPayments(qs.toString());
    setPayments(rows);
    setFilterPeriod(filters?.period || '');
    setFilterMember(filters?.member_id != null ? String(filters.member_id) : '');
    setDueDates(Object.fromEntries(rows.map((p) => [p.id, p.due_date || ''])));
  };

  const approve = async (id) => {
    await api.approvePayment(id);
    await reload();
  };

  const reject = async (id) => {
    await api.rejectPayment(id);
    await reload();
  };

  const decideRequest = async (id, decision) => {
    setError('');
    setBusyRequest(id);
    try {
      if (decision === 'approve') await api.approvePaymentRequest(id);
      else await api.rejectPaymentRequest(id);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyRequest(null);
    }
  };

  const saveDueDate = async (id) => {
    setError('');
    setBusyDueId(id);
    try {
      await api.setPaymentDueDate(id, dueDates[id] || '');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyDueId(null);
    }
  };

  const periods = [...new Set(payments.map((p) => p.period))].sort().reverse();
  const latest = periods[0];
  const summary = payments.filter((p) => p.period === latest).reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      if (p.status === 'paid') acc.collected += Number(p.amount_paid || 0);
      return acc;
    },
    { paid: 0, requested: 0, unpaid: 0, collected: 0 }
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Payment approvals</h1>
          <p className="page-sub">
            Review combined payment requests, approve contributions, and give members fines with
            their own reasons.
          </p>
        </div>
      </div>

      <div className="card pad requests-card" style={{ marginBottom: 16 }}>
        <div className="row-between" style={{ gap: 10 }}>
          <div className="section-head">
            <span className="icon-tile blue">
              <ReceiptText size={18} />
            </span>
            <div>
              <h2 className="section-title">Payment requests</h2>
              <p className="muted small" style={{ marginTop: 3 }}>
                Members can pay any or all of their dues — monthly, arrears, special contributions
                and fines — in one request, including part payments. Approve a request to update
                every balance it covers.
              </p>
            </div>
          </div>
          <span className="badge pending">
            {requests.filter((r) => r.status === 'requested').length} awaiting
          </span>
        </div>

        {requests.length === 0 ? (
          <p className="muted small" style={{ marginTop: 14 }}>
            No payment requests have been sent yet.
          </p>
        ) : (
          <div className="request-list" style={{ marginTop: 14 }}>
            {requests.map((r) => (
              <div className="request-row" key={r.id}>
                <Avatar name={r.display_name} className="sm" />
                <div className="request-copy">
                  <div className="request-title-row">
                    <strong>{r.display_name}</strong>
                    <span className={`badge status-${r.status}`}>
                      {r.status === 'requested'
                        ? 'Awaiting approval'
                        : r.status === 'paid'
                          ? 'Approved'
                          : 'Rejected'}
                    </span>
                  </div>
                  <span className="muted small">
                    @{r.username} · {fmtDateShort(String(r.requested_at).slice(0, 10))} ·{' '}
                    {r.items.length} {r.items.length === 1 ? 'item' : 'items'}
                  </span>
                  <div className="request-items">
                    {r.items.map((item) => {
                      const result = requestItemResult(r, item);
                      return (
                        <span className="request-item" key={item.id}>
                          <span>
                            {item.label} <strong>{fmt(item.amount)}</strong>
                          </span>
                          <span className={`request-item-result ${result.cls}`}>{result.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <strong className="request-amount">{fmt(r.amount)}</strong>
                <div className="actions">
                  {r.proof?.message && (
                    <button
                      className="btn ghost sm"
                      onClick={() =>
                        setProofView({
                          title: `${r.display_name}'s payment message`,
                          subtitle: `Combined request · ${fmt(r.amount)}`,
                          amountDue: Number(r.amount),
                          proof: r.proof,
                        })
                      }
                    >
                      <ReceiptText size={14} />
                      Proof
                    </button>
                  )}
                  {r.status === 'requested' && (
                    <>
                      <button
                        className="btn sm"
                        disabled={busyRequest === r.id}
                        onClick={() => decideRequest(r.id, 'approve')}
                      >
                        {busyRequest === r.id ? (
                          <Loader2 size={14} className="spin-ico" />
                        ) : (
                          <BadgeCheck size={14} />
                        )}
                        Approve
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={busyRequest === r.id}
                        onClick={() => decideRequest(r.id, 'reject')}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FinesManager members={members} onChange={reload} title="Independent fines" />

      <ContributionsAdmin />

      <div className="card pad" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Member
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            aria-label="Filter payments by member"
          >
            <option value="">All members</option>
            {members
              .filter((m) => m.role === 'member')
              .sort((a, b) => a.display_name.localeCompare(b.display_name))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} (@{m.username})
                </option>
              ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Month
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            aria-label="Filter payments by month"
          >
            <option value="">All months</option>
            {periods.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={applyFilters}>
          Apply filter
        </button>
        <button className="btn ghost" onClick={() => { setFilterMember(''); setFilterPeriod(''); applyFilters(); }}>
          Clear
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Collected · {latest}</span>
            <span className="icon-tile green">
              <Wallet size={18} />
            </span>
          </div>
          <span className="stat-value">{fmt(summary.collected)}</span>
          <span className="stat-hint">Approved contributions this period</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Paid</span>
            <span className="icon-tile green">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <span className="stat-value">{summary.paid}</span>
          <span className="stat-hint">of {summary.paid + summary.requested + summary.unpaid} members</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Awaiting approval</span>
            <span className="icon-tile blue">
              <Clock3 size={18} />
            </span>
          </div>
          <span className="stat-value">{summary.requested}</span>
          <span className="stat-hint">{summary.requested === 1 ? 'Request' : 'Requests'} to review</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Unpaid</span>
            <span className="icon-tile amber">
              <XCircle size={18} />
            </span>
          </div>
          <span className="stat-value">{summary.unpaid}</span>
          <span className="stat-hint">Not yet contributed this period</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <MonthExport periods={periods} onDownload={api.exportMonth} />

      {payments.length === 0 && !error ? (
        <div className="empty-state">
          <div className="icon-tile">
            <Wallet size={22} />
          </div>
          <h3>No payments yet</h3>
          <p>Payment records for members will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Month</th>
                <th>Due date</th>
                <th>Contribution</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.display_name}</strong>
                    <div className="muted small">@{p.username}</div>
                  </td>
                  <td>
                    <span className="badge pending" style={{ textTransform: 'none' }}>{p.period}</span>
                  </td>
                  <td>
                    <div className="due-date-form">
                      <input
                        type="date"
                        value={dueDates[p.id] ?? p.due_date ?? ''}
                        onChange={(e) => setDueDates((current) => ({ ...current, [p.id]: e.target.value }))}
                        aria-label={`Due date for ${p.display_name}`}
                      />
                      <button
                        className="btn ghost sm"
                        disabled={busyDueId === p.id}
                        onClick={() => saveDueDate(p.id)}
                      >
                        {busyDueId === p.id ? <Loader2 size={14} className="spin-ico" /> : 'Save'}
                      </button>
                    </div>
                    <span className="field-hint">Reminder is sent 5 days before.</span>
                  </td>
                  <td>{fmt(p.amount)}</td>
                  <td>{fmt(p.amount_paid || 0)}</td>
                  <td>
                    <strong className={Number(p.balance) > 0 ? 'fine-amount' : ''}>
                      {fmt(p.balance ?? p.total)}
                    </strong>
                  </td>
                  <td>{statusBadge(p.status)}</td>
                  <td>
                    <div className="actions">
                      {p.proof && (
                        <button
                          className="btn ghost sm"
                          onClick={() =>
                            setProofView({
                              title: `${p.display_name} · ${p.period}`,
                              subtitle: 'Payment message pasted by the member',
                              amountDue: p.total,
                              proof: p.proof,
                            })
                          }
                        >
                          <ReceiptText size={14} />
                          Proof
                        </button>
                      )}
                      {p.status !== 'paid' && p.status !== 'partial' && (
                        <button className="btn sm" title="Mark as paid" onClick={() => approve(p.id)}>
                          Approve
                        </button>
                      )}
                      {p.status === 'requested' && (
                        <button className="btn sm danger-ghost" onClick={() => reject(p.id)}>
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proofView && (
        <ProofViewer
          title={proofView.title}
          subtitle={proofView.subtitle}
          amountDue={proofView.amountDue}
          proof={proofView.proof}
          onClose={() => setProofView(null)}
        />
      )}
    </div>
  );
}