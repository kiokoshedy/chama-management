import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardPaste,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import { api } from './api.js';
import { fmt } from './format.js';
import { ProofDetails } from './ProofDialog.jsx';

// One "pay" action can settle any mix of monthly dues, special contributions,
// fines and arrears. The member chooses what the money is for and may pay only
// part of it; the approved amount is then taken off those balances only.

const GROUP_LABELS = {
  monthly: 'Monthly contributions',
  contribution: 'Special contributions',
  fine: 'Fines',
  arrears: 'Previous Arrears',
};

const GROUP_ORDER = ['monthly', 'contribution', 'fine', 'arrears'];

export default function PayDialog({ items, initialKeys = [], onClose, onPaid }) {
  const selectable = useMemo(() => items.filter((i) => !i.locked && i.outstanding > 0), [items]);
  const [selectedKeys, setSelectedKeys] = useState(() => {
    const preferred = initialKeys.filter((key) => selectable.some((i) => i.key === key));
    return preferred.length ? preferred : selectable.map((i) => i.key);
  });
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(
    () => selectable.filter((i) => selectedKeys.includes(i.key)),
    [selectable, selectedKeys]
  );
  const selectedTotal = useMemo(
    () => selected.reduce((sum, i) => sum + Number(i.outstanding || 0), 0),
    [selected]
  );

  useEffect(() => {
    setAmount(String(selectedTotal));
  }, [selectedTotal]);

  useEffect(() => {
    if (!message.trim()) {
      setParsed(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      api
        .parseProof(message)
        .then((result) => setParsed(result.parsed || null))
        .catch(() => setParsed(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const toggle = (key) => {
    setError('');
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  const amountValue = Number(amount);
  const amountInvalid = !Number.isFinite(amountValue) || amountValue <= 0 || amountValue > selectedTotal;
  const canSubmit = selected.length > 0 && !amountInvalid && message.trim().length >= 12 && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await api.payPending({
        items: selected.map((i) => ({ type: i.type, id: i.id })),
        amount: Math.round(Number(amount) * 100) / 100,
        proof_message: message.trim(),
      });
      onPaid();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    rows: items.filter((i) => i.type === type),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal pay-modal" role="dialog" aria-modal="true" aria-label="Pay outstanding amounts">
        <div className="modal-head">
          <span className="icon-tile green">
            <Wallet size={18} />
          </span>
          <div>
            <h2 className="section-title">Pay outstanding amounts</h2>
            <p className="muted small">
              Select one or several amounts, then paste the confirmation message for the money you sent.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          {items.length === 0 ? (
            <div className="alert success">
              <ShieldCheck size={16} />
              You have nothing outstanding right now.
            </div>
          ) : (
            <>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13.5 }}>What are you paying for?</strong>
                <div className="actions">
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setSelectedKeys(selectable.map((i) => i.key))}
                    disabled={busy || selectable.length === 0}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="btn subtle sm"
                    onClick={() => setSelectedKeys([])}
                    disabled={busy || selectedKeys.length === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="pay-items">
                {grouped.map((group) => (
                  <div className="pay-group" key={group.type}>
                    <span className="pay-group-title">{GROUP_LABELS[group.type]}</span>
                    {group.rows.map((item) => {
                      const checked = selectedKeys.includes(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`pay-item ${item.locked ? 'locked' : ''} ${checked ? 'checked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={item.locked || busy}
                            onChange={() => toggle(item.key)}
                          />
                          <span className="pay-item-copy">
                            <strong>{item.label}</strong>
                            <span className="muted small">
                              {item.locked
                                ? 'A payment for this is already awaiting approval'
                                : item.detail || `Outstanding ${fmt(item.outstanding)}`}
                            </span>
                          </span>
                          <strong className="pay-item-amount">{fmt(item.outstanding)}</strong>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="pay-summary">
                <span>
                  <span className="muted small">Selected balance</span>
                  <strong>{fmt(selectedTotal)}</strong>
                </span>
                <span>
                  <span className="muted small">Amount you are paying</span>
                  <strong>{fmt(Number.isFinite(amountValue) ? amountValue : 0)}</strong>
                </span>
              </div>

              <div className="field">
                <label htmlFor="pay-amount">Amount paid (KSh)</label>
                <input
                  id="pay-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  max={selectedTotal}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy || selected.length === 0}
                />
                <span className="field-hint">
                  You can pay less than the selected balance. Once approved, it clears the oldest
                  selected dues first; the remainder stays on the later dues.
                </span>
              </div>
              {amountInvalid && amount !== '' && (
                <div className="alert info">
                  <TriangleAlert size={16} />
                  Enter an amount between 1 and {fmt(selectedTotal)}.
                </div>
              )}

              <div className="field">
                <label htmlFor="pay-proof">Paste your transaction confirmation</label>
                <textarea
                  id="pay-proof"
                  rows={4}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="M-PESA Confirmed. Ksh2,500 sent to Safaricom M-PESA on 24/11/2026 at 10:23 AM. Ref: QJG7X2K9LM"
                />
                <span className="field-hint">
                  The admin checks this message before the payment is recorded.
                </span>
              </div>

              {parsed && (
                <div className="proof-preview">
                  <span className="proof-raw-head">
                    <ShieldCheck size={13} /> What we read from it
                  </span>
                  <ProofDetails
                    proof={{ ...parsed, received_at: null }}
                    amountDue={Number.isFinite(amountValue) ? amountValue : null}
                    audience="member"
                  />
                </div>
              )}

              {error && (
                <div className="alert error">
                  <TriangleAlert size={16} />
                  {error}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={!canSubmit}>
                  {busy ? (
                    <Loader2 size={15} className="spin-ico" style={{ position: 'static' }} />
                  ) : (
                    <ClipboardPaste size={15} />
                  )}
                  Send to admin
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
