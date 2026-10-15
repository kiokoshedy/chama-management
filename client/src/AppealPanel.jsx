import { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquareText,
  Send,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { api } from './api.js';
import { fmtDate } from './format.js';

// Shown to a suspended or expelled member. It spells out why they were blocked
// and lets them appeal the decision; the outcome (and any admin note) is shown
// back to them here the next time they sign in.

const APPEAL_STATE = {
  pending: { icon: Clock, label: 'Pending review' },
  approved: { icon: CheckCircle2, label: 'Approved' },
  declined: { icon: XCircle, label: 'Declined' },
};

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 1000;

export function AppealPanel({ member }) {
  const [appeals, setAppeals] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const { appeals: rows } = await api.myAppeals();
      setAppeals(rows);
    } catch {
      setAppeals([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pending = appeals.find((a) => a.status === 'pending');

  const submit = async () => {
    setError('');
    setNotice('');
    const text = message.trim();
    if (text.length < MIN_MESSAGE) {
      setError(`Please explain your appeal in at least ${MIN_MESSAGE} characters.`);
      return;
    }
    setBusy(true);
    try {
      await api.submitAppeal(text);
      setMessage('');
      setNotice('Your appeal has been sent to the admins.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="appeal-panel">
      {member.status_reason && (
        <div className={`appeal-reason ${member.status}`}>
          <span className="appeal-reason-head">
            <Ban size={14} />
            Reason given
          </span>
          <p>{member.status_reason}</p>
        </div>
      )}

      {loaded && appeals.length > 0 && (
        <div className="appeal-history">
          {appeals.map((a) => {
            const state = APPEAL_STATE[a.status] || {};
            const StateIcon = state.icon || Clock;
            return (
              <div className={`appeal-entry ${a.status}`} key={a.id}>
                <div className="appeal-entry-head">
                  <span className={`badge ${a.status === 'pending' ? 'pending' : a.status}`}>
                    <StateIcon size={12} />
                    {state.label}
                  </span>
                  <span className="muted small">{fmtDate(a.created_at)}</span>
                </div>
                <p className="appeal-entry-message">{a.message}</p>
                {a.response && (
                  <p className="appeal-entry-response">
                    <MessageSquareText size={13} />
                    <span>
                      <strong>Admin response:</strong> {a.response}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending ? (
        <p className="appeal-note">
          <Clock size={14} />
          Your appeal is waiting for an admin to review it. You can send another once a decision
          is made.
        </p>
      ) : (
        <div className="appeal-form">
          <label htmlFor="appeal-message" className="appeal-form-label">
            Appeal this decision
          </label>
          <textarea
            id="appeal-message"
            rows={3}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Explain why your account should be reactivated…"
          />
          {error && (
            <p className="error">
              <TriangleAlert size={14} /> {error}
            </p>
          )}
          {notice && <p className="appeal-notice">{notice}</p>}
          <button
            className="btn block"
            onClick={submit}
            disabled={busy || message.trim().length < MIN_MESSAGE}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="spinner sm" style={{ position: 'static' }} />
                Sending…
              </>
            ) : (
              <>
                <Send size={15} />
                Send appeal
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
