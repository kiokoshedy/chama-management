import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Save,
  UserCircle2,
  Loader2,
  KeyRound,
  Phone,
  Wallet,
  CheckCircle2,
  CircleAlert,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { PageHeader, StatCard } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { fmt } from '../format.js';

export default function Profile() {
  const { member, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    display_name: member.display_name,
    bio: member.bio || '',
    phone: member.phone || '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [summary, setSummary] = useState({ collected: 0, count: 0, outstanding: 0 });

  useEffect(() => {
    api
      .paymentsMe()
      .then(({ payments }) => {
        const collected = payments
          .filter((p) => p.status === 'paid')
          .reduce((sum, p) => sum + Number(p.total || 0), 0);
        const outstanding = payments
          .filter((p) => p.status !== 'paid')
          .reduce((sum, p) => sum + Number(p.total || 0), 0);
        setSummary({ collected, count: payments.length, outstanding });
      })
      .catch(() => {});
  }, []);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const changePw = (e) => setPw({ ...pw, [e.target.name]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api.updateMe(form);
      await refresh();
      setMessage('Profile saved.');
      toast.success('Profile updated', 'Your details are saved and visible to the group.');
    } catch (err) {
      setError(err.message);
      toast.error('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwMessage('');
    if (pw.new_password.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pw.new_password !== pw.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword({
        current_password: pw.current_password,
        new_password: pw.new_password,
      });
      setPw({ current_password: '', new_password: '', confirm: '' });
      setPwMessage('Password updated. Use your new password next time you sign in.');
      toast.success('Password updated', 'Use your new password the next time you sign in.');
    } catch (err) {
      setPwError(err.message);
      toast.error('Could not update password', err.message);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Your public member details — visible to the rest of the group in the directory."
      />

      <div className="card wide">
        <div className="profile-hero">
          <Avatar name={form.display_name || member.display_name} className="xl" />
          <div>
            <h2>{form.display_name || member.display_name}</h2>
            <div className="profile-meta">
              <span className={`badge ${member.role}`}>{member.role}</span>
              {member.designation && <span className="badge designation">{member.designation}</span>}
              <span className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <CalendarDays size={13} />
                Member since {member.created_at}
              </span>
            </div>
          </div>
        </div>

        <div className="profile-body">
          <div className="stat-grid" style={{ marginBottom: 22 }}>
            <StatCard
              label="Total contributed"
              value={fmt(summary.collected)}
              hint={`${summary.count} payment records`}
              icon={Wallet}
              tone="green"
            />
            <StatCard
              label="Outstanding"
              value={fmt(summary.outstanding)}
              hint="Still to be cleared"
              icon={CircleAlert}
              tone="amber"
            />
            <StatCard
              label="Access level"
              value={member.role === 'admin' ? 'Admin' : 'Member'}
              hint={member.designation || 'Regular member'}
              icon={ShieldCheck}
              tone="blue"
            />
          </div>

          <form onSubmit={save}>
            <div className="field">
              <label htmlFor="display_name">Display name</label>
              <input
                id="display_name"
                name="display_name"
                value={form.display_name}
                onChange={change}
                placeholder="Your full name"
              />
            </div>

            <div className="field">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                value={form.bio}
                onChange={change}
                rows={4}
                placeholder="Tell your group a little about yourself…"
              />
              <span className="field-hint">Shown on your card in the member directory.</span>
            </div>

            <div className="field">
              <label htmlFor="phone">Mobile number</label>
              <div className="input-with-icon">
                <Phone size={16} />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={change}
                  placeholder="0712345678"
                  autoComplete="tel"
                />
              </div>
              <span className="field-hint">
                Used for contribution reminders. Kenyan numbers are normalised automatically.
              </span>
            </div>

            {message && (
              <div className="alert success" style={{ marginBottom: 0 }}>
                <UserCircle2 size={17} />
                {message}
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginBottom: 0 }}>
                <UserCircle2 size={17} />
                {error}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <button className="btn" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 size={16} className="spin-ico" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Save profile
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card wide" style={{ marginTop: 22 }}>
        <div className="card-header">
          <div className="card-title-row">
            <span className="icon-tile amber">
              <KeyRound size={18} />
            </span>
            <div>
              <h2>Change password</h2>
              <p className="muted small">Set your own password — you sign in with this one.</p>
            </div>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={savePassword}>
            <div className="field">
              <label htmlFor="current_password">Current password</label>
              <input
                id="current_password"
                name="current_password"
                type={showPw ? 'text' : 'password'}
                value={pw.current_password}
                onChange={changePw}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="new_password">New password</label>
                <div className="input-with-icon">
                  <KeyRound size={16} />
                  <input
                    id="new_password"
                    name="new_password"
                    type={showPw ? 'text' : 'password'}
                    value={pw.new_password}
                    onChange={changePw}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    className="icon-btn input-action"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="confirm">Confirm new password</label>
                <input
                  id="confirm"
                  name="confirm"
                  type={showPw ? 'text' : 'password'}
                  value={pw.confirm}
                  onChange={changePw}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            {pwMessage && (
              <div className="alert success" style={{ marginBottom: 0 }}>
                <CheckCircle2 size={17} />
                {pwMessage}
              </div>
            )}
            {pwError && (
              <div className="alert error" style={{ marginBottom: 0 }}>
                <UserCircle2 size={17} />
                {pwError}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <button className="btn" disabled={pwSaving}>
                {pwSaving ? (
                  <>
                    <Loader2 size={16} className="spin-ico" />
                    Updating…
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    Update password
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
