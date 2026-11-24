import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { api } from './api.js';
import { fmt, fmtDateShort } from './format.js';
import { Avatar } from './App.jsx';

// Fines are their own records: a member can be fined for arriving late, missing
// a meeting, or any other reason without any contribution being involved.
export default function FinesManager({ members = [], memberId = null, onChange, title = 'Fines' }) {
  const payingMembers = members.filter((m) => m.role !== 'admin');
  const [fines, setFines] = useState([]);
  const [form, setForm] = useState({ member_id: memberId || payingMembers[0]?.id || '', amount: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const { fines: rows } = await api.adminFines(memberId);
    setFines(rows);
  };

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [memberId]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      member_id: memberId || current.member_id || payingMembers[0]?.id || '',
    }));
  }, [memberId, members]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!form.member_id) return setError('Choose a member for this fine.');
    setBusy(true);
    try {
      await api.createFine({
        member_id: form.member_id,
        amount: Number(form.amount),
        reason: form.reason.trim(),
      });
      setForm((current) => ({ ...current, amount: '', reason: '' }));
      setMessage('Fine added to the member’s outstanding total.');
      await load();
      await onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (fine) => {
    if (!window.confirm(`Remove the ${fmt(fine.amount)} fine for ${fine.reason || 'this reason'}?`)) return;
    setError('');
    setMessage('');
    setDeleteId(fine.id);
    try {
      await api.deleteFine(fine.id);
      setMessage('Fine removed.');
      await load();
      await onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteId(null);
    }
  };

  const outstanding = fines.reduce((sum, f) => sum + Number(f.balance || 0), 0);
  const memberName = (id) => members.find((m) => m.id === id)?.display_name || `Member #${id}`;

  return (
    <div className="card pad fines-manager">
      <div className="row-between" style={{ gap: 10 }}>
        <div className="section-head">
          <span className="icon-tile amber">
            <TriangleAlert size={18} />
          </span>
          <div>
            <h2 className="section-title">{title}</h2>
            <p className="muted small" style={{ marginTop: 3 }}>
              Give a fine with its own reason. It stands alone — no contribution is needed — and can
              be paid in full or in part.
            </p>
          </div>
        </div>
        <span className="badge pending" title="Fines still outstanding here">
          {fmt(outstanding)}
        </span>
      </div>

      {error && (
        <div className="alert error" style={{ marginTop: 14 }}>
          <ShieldCheck size={17} />
          {error}
        </div>
      )}
      {message && (
        <div className="alert success" style={{ marginTop: 14 }}>
          <CheckCircle2 size={17} />
          {message}
        </div>
      )}

      <form className="fines-create" onSubmit={create}>
        {!memberId && (
          <div className="field">
            <label>Member</label>
            <select
              value={form.member_id}
              onChange={(e) => setField('member_id', e.target.value)}
              aria-label="Member to fine"
            >
              <option value="">Choose a member…</option>
              {payingMembers
                .slice()
                .sort((a, b) => a.display_name.localeCompare(b.display_name))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} (@{m.username})
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Amount (KSh)</label>
          <input
            type="number"
            min="1"
            step="0.01"
            value={form.amount}
            onChange={(e) => setField('amount', e.target.value)}
            placeholder="500"
            required
          />
        </div>
        <div className="field">
          <label>Reason</label>
          <input
            value={form.reason}
            onChange={(e) => setField('reason', e.target.value)}
            placeholder="Arrived late, missed a meeting…"
            maxLength={200}
            required
          />
        </div>
        <button className="btn" disabled={busy} style={{ alignSelf: 'end' }}>
          {busy ? <Loader2 size={16} className="spin-ico" /> : <Plus size={16} />}
          Add fine
        </button>
      </form>

      {fines.length === 0 ? (
        <p className="muted small" style={{ marginTop: 16 }}>
          No fines have been given{memberId ? ' to this member' : ''} yet.
        </p>
      ) : (
        <div className="fines-list">
          {fines.map((fine) => (
            <div className="fine-row" key={fine.id}>
              {!memberId && <Avatar name={fine.display_name || memberName(fine.member_id)} className="sm" />}
              <div className="fine-row-copy">
                <strong>{fine.reason || 'Fine'}</strong>
                <span className="muted small">
                  {!memberId && `${fine.display_name || memberName(fine.member_id)} · `}
                  {fmtDateShort(String(fine.created_at).slice(0, 10))}
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
              <button
                className="btn ghost sm"
                disabled={fine.amount_paid > 0 || deleteId === fine.id}
                title={fine.amount_paid > 0 ? 'A part-paid fine cannot be removed' : 'Remove this fine'}
                onClick={() => remove(fine)}
              >
                {deleteId === fine.id ? <Loader2 size={14} className="spin-ico" /> : <Trash2 size={14} />}
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
