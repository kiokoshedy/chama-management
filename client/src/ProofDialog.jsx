import { useEffect, useRef, useState } from 'react';
import {
  ClipboardPaste,
  Loader2,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api } from './api.js';
import { fmt, fmtDate } from './format.js';

// A member cannot mark a contribution as paid until they paste the confirmation
// message they got from M-Pesa or their bank. The dialog shows what the server
// was able to read out of the paste so nobody submits the wrong message.

const PLACEHOLDER =
  'M-PESA Confirmed. Ksh2,500 sent to Safaricom M-PESA on 05/10/2026 at 10:23 AM. Ref: QJG7X2K9LM';

export function ProofDetails({ proof, amountDue = null, audience = 'admin' }) {
  if (!proof) {
    return (
      <p className="muted small">
        <TriangleAlert size={13} style={{ verticalAlign: 'text-bottom' }} /> No payment message was
        pasted for this payment.
      </p>
    );
  }

  const mismatch =
    proof.amount != null && amountDue != null && Number(proof.amount) !== Number(amountDue);

  const chips = [
    { label: 'Provider', value: proof.provider_label },
    { label: 'Amount', value: proof.amount == null ? 'Not found' : fmt(proof.amount), tone: mismatch ? 'bad' : 'good' },
    { label: 'Reference', value: proof.code || 'Not found' },
    { label: 'Date', value: proof.date ? `${proof.date}${proof.time ? ` · ${proof.time}` : ''}` : 'Not found' },
    { label: 'Account', value: proof.account || '—' },
  ];

  return (
    <div className="proof-details">
      {mismatch && (
        <div className="alert info">
          <TriangleAlert size={16} />
          {audience === 'admin'
            ? `The amount on the message (${fmt(proof.amount)}) does not match the amount due (${fmt(
                amountDue
              )}). Check it before approving.`
            : `This message says ${fmt(proof.amount)}, but ${fmt(amountDue)} is due. Paste the right message, or ask the admin if you paid a different amount.`}
        </div>
      )}
      <div className="proof-chips">
        {chips.map(({ label, value, tone }) => (
          <span className={`proof-chip ${tone ? tone : ''}`} key={label}>
            <span className="proof-chip-label">{label}</span>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      <div className="proof-raw">
        <span className="proof-raw-head">
          <MessageSquareText size={13} /> Message as pasted
        </span>
        <pre>{proof.message}</pre>
      </div>
      {proof.warnings?.length > 0 && (
        <ul className="proof-warnings">
          {proof.warnings.map((warning) => (
            <li key={warning}>
              <TriangleAlert size={13} /> {warning}
            </li>
          ))}
        </ul>
      )}
      {proof.received_at && (
        <span className="field-hint">Submitted {fmtDate(proof.received_at)}</span>
      )}
    </div>
  );
}

export function ProofDialog({ title, subtitle, amountDue, initialMessage = '', busy, error, onCancel, onSubmit }) {
  const [message, setMessage] = useState(initialMessage);
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!message.trim()) {
      setParsed(null);
      return undefined;
    }
    setParsing(true);
    const timer = setTimeout(() => {
      api
        .parseProof(message)
        .then(setParsed)
        .catch(() => setParsed(null))
        .finally(() => setParsing(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const trimmed = message.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 12;
  const canSubmit = trimmed.length >= 12 && !busy;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className="icon-tile green">
            <ReceiptText size={18} />
          </span>
          <div>
            <h2 className="section-title">{title}</h2>
            <p className="muted small">{subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onCancel} disabled={busy} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit(trimmed);
          }}
        >
          <div className="proof-due">
            <span className="muted small">Amount due</span>
            <strong>{fmt(amountDue)}</strong>
          </div>

          <div className="field">
            <label htmlFor="proof-message">Paste your transaction confirmation</label>
            <textarea
              id="proof-message"
              ref={textareaRef}
              rows={5}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={PLACEHOLDER}
            />
            <span className="field-hint">
              Works with the M-Pesa “Confirmed” SMS, your bank/USSD alert, or the confirmation
              screen from your banking app. Paste the whole message — it is what the admin checks.
            </span>
          </div>

          {tooShort && (
            <div className="alert info">
              <TriangleAlert size={16} />
              Paste the full message so the amount and reference code can be read from it.
            </div>
          )}

          {parsing && (
            <p className="muted small">
              <Loader2 size={13} className="spin-ico" style={{ position: 'static' }} /> Reading the
              message…
            </p>
          )}

          {parsed && (
            <div className="proof-preview">
              <span className="proof-raw-head">
                <ShieldCheck size={13} /> What we read from it
              </span>
              <ProofDetails
                proof={{ ...parsed, received_at: null }}
                amountDue={amountDue}
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
            <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={!canSubmit}>
              {busy ? <Loader2 size={15} className="spin-ico" style={{ position: 'static' }} /> : <ClipboardPaste size={15} />}
              Send to admin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProofViewer({ proof, title, subtitle, amountDue, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className="icon-tile green">
            <ReceiptText size={18} />
          </span>
          <div>
            <h2 className="section-title">{title}</h2>
            <p className="muted small">{subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <div className="proof-due">
            <span className="muted small">Amount due</span>
            <strong>{fmt(amountDue)}</strong>
          </div>
          <ProofDetails proof={proof} amountDue={amountDue} />
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
