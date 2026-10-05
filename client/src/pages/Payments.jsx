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
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../App.jsx';
import { ProofDialog, ProofViewer } from '../ProofDialog.jsx';
import MonthExport from '../MonthExport.jsx';
import { fmt, currency, deadlineState, todayInKenya } from '../format.js';

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
          <input name="title" value={form.title} onChange={change} placeholder="e.g. Wedding gift for Sara" required />
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
    {s === 'paid' ? 'Paid' : s === 'requested' ? 'Awaiting approval' : 'Unpaid'}
  </span>
);

const contribStatus = (state) => (
  <span className={`badge status-${state === 'approved' ? 'paid' : state === 'pending' ? 'requested' : 'unpaid'}`}>
    {state === 'approved' ? 'Approved' : state === 'pending' ? 'Awaiting approval' : 'Not paid'}
  </span>
);

function ContribDeadline({ deadline }) {
  const ds = deadlineState(deadline);
  return (
    <span className={`deadline-chip ${ds.cls}`}>
      <CalendarClock size={13} />
      {ds.label}
    </span>
  );
}

function MemberContribs({ contribs, busyId, onPay, onCancel, onEditProof, onViewProof }) {
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
                  I have paid
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
  const isAdmin = member.role === 'admin';
  return isAdmin ? <AdminPayments /> : <MemberPayments />;
}

function MemberPayments() {
  const { member } = useAuth();
  const [payments, setPayments] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [proofForm, setProofForm] = useState(null);
  const [proofError, setProofError] = useState('');
  const [proofBusy, setProofBusy] = useState(false);
  const [proofView, setProofView] = useState(null);

  const load = async () => {
    const [{ payments }, { contributions }] = await Promise.all([
      api.paymentsMe(),
      api.contributions(),
    ]);
    setPayments(payments);
    setContribs(contributions);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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
      if (kind === 'monthly') {
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

  const paid = payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.total, 0);
  const unpaid = payments.filter((p) => p.status !== 'paid').length;
  const pendingContribs = contribs.filter((c) => c.mine?.state === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My payments</h1>
          <p className="page-sub">
            Welcome, {member.display_name}. Once you have paid, tap "I have paid" and paste the
            M-Pesa or Bank confirmation message — the admin checks it before approving.
          </p>
        </div>
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
          <span className="stat-hint">Across all approved payments</span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Outstanding</span>
            <span className="icon-tile amber">
              <Clock3 size={18} />
            </span>
          </div>
          <span className="stat-value">{unpaid}</span>
          <span className="stat-hint">
            {unpaid === 1 ? 'Payment' : 'Payments'} not yet cleared
          </span>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Special contributions pending</span>
            <span className="icon-tile blue">
              <HandCoins size={18} />
            </span>
          </div>
          <span className="stat-value">{pendingContribs}</span>
          <span className="stat-hint">
            {pendingContribs === 1 ? 'Awaiting' : 'Awaiting'} admin approval
          </span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <MemberContribs
        contribs={contribs}
        busyId={busyId}
        onPay={askContribProof}
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
                <th>Fine</th>
                <th>Total</th>
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
                  <td>
                    {p.fine > 0 ? (
                      <>
                        <strong className="fine-amount">{fmt(p.fine)}</strong>
                        {p.fine_reason && <div className="fine-reason">{p.fine_reason}</div>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <strong>{fmt(p.total)}</strong>
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
                      {p.status === 'unpaid' && (
                        <button className="btn subtle sm" onClick={() => askMonthlyProof(p)}>
                          <BadgeCheck size={14} />
                          I have paid
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
  const [payments, setPayments] = useState([]);
  const [dueDates, setDueDates] = useState({});
  const [busyDueId, setBusyDueId] = useState(null);
  const [error, setError] = useState('');
  const [fines, setFines] = useState({});
  const [fineReasons, setFineReasons] = useState({});
  const [proofView, setProofView] = useState(null);

  const load = async () => {
    const { payments } = await api.adminPayments();
    setPayments(payments);
    setDueDates(Object.fromEntries(payments.map((p) => [p.id, p.due_date || ''])));
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const approve = async (id) => {
    await api.approvePayment(id);
    await load();
  };

  const reject = async (id) => {
    await api.rejectPayment(id);
    await load();
  };

  const fine = async (id) => {
    const amount = Number(fines[id]);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      await api.finePayment(id, amount, fineReasons[id] || '');
      setFines({ ...fines, [id]: '' });
      setFineReasons({ ...fineReasons, [id]: '' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const clearFine = async (id) => {
    try {
      await api.finePayment(id, 0, '');
      await load();
    } catch (e) {
      setError(e.message);
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

  const periods = [...new Set(payments.map((p) => p.period))];
  const latest = periods[0];
  const summary = payments.filter((p) => p.period === latest).reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      if (p.status === 'paid') acc.collected += p.total;
      return acc;
    },
    { paid: 0, requested: 0, unpaid: 0, collected: 0 }
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Payments</h1>
          <p className="page-sub">Review requests, approve contributions, and apply fines.</p>
        </div>
      </div>

      <ContributionsAdmin />

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
                <th>Fine</th>
                <th>Total</th>
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
                  <td>
                    {p.fine > 0 ? (
                      <>
                        <strong className="fine-amount">{fmt(p.fine)}</strong>
                        {p.fine_reason && <div className="fine-reason">{p.fine_reason}</div>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <strong>{fmt(p.total)}</strong>
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
                      {p.status !== 'paid' && (
                        <button className="btn sm" title="Mark as paid" onClick={() => approve(p.id)}>
                          Approve
                        </button>
                      )}
                      {p.status === 'requested' && (
                        <button className="btn sm danger-ghost" onClick={() => reject(p.id)}>
                          Reject
                        </button>
                      )}
                      <div className="fine-form" title="Set a fine for this member">
                        <input
                          className="fine-input"
                          type="number"
                          min="0"
                          step="any"
                          placeholder={`Fine (${currency})`}
                          value={fines[p.id] ?? ''}
                          onChange={(e) => setFines({ ...fines, [p.id]: e.target.value })}
                        />
                        <input
                          className="fine-input reason"
                          type="text"
                          maxLength={200}
                          placeholder="Reason"
                          value={fineReasons[p.id] ?? ''}
                          onChange={(e) => setFineReasons({ ...fineReasons, [p.id]: e.target.value })}
                        />
                        <button
                          className="btn sm ghost"
                          disabled={!Number(fines[p.id])}
                          title={p.fine > 0 ? 'Replace the current fine' : 'Apply a fine'}
                          onClick={() => fine(p.id)}
                        >
                          {p.fine > 0 ? `Update (${fmt(p.fine)})` : 'Add fine'}
                        </button>
                        {p.fine > 0 && (
                          <button
                            className="btn sm subtle"
                            title="Remove this fine"
                            onClick={() => clearFine(p.id)}
                          >
                            Clear
                          </button>
                        )}
                      </div>
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