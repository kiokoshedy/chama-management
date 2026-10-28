import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../theme.jsx';
import {
  LayoutGrid,
  ShieldCheck,
  Users,
  Wallet,
  Info,
  Loader2,
  Moon,
  Sun,
  Eye,
  EyeOff,
  User,
  Lock,
  ArrowRight,
  ReceiptText,
  BellRing,
} from 'lucide-react';

const POINTS = [
  { icon: Users, text: 'A member directory that stays up to date' },
  { icon: Wallet, text: 'Contributions, dues and payment proof in one place' },
  { icon: BellRing, text: 'Automatic reminders before every due date' },
  { icon: ShieldCheck, text: 'Accounts and roles managed by your admin' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Group Hub';
    return () => {
      document.title = 'Group Hub — Exclusive It’s Us';
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login({ username, password });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-hero">
        <div className="brand-row">
          <span className="brand-mark">
            <LayoutGrid size={20} />
          </span>
          <strong>Group Hub</strong>
        </div>

        <div>
          <h2>Your group, organised and accounted for.</h2>
          <p className="hero-sub">
            One calm place for the member directory, monthly contributions and the constitution —
            built for a group that wants its records to add up.
          </p>

          <div className="auth-points">
            {POINTS.map(({ icon: Icon, text }) => (
              <div className="auth-point" key={text}>
                <span className="check">
                  <Icon size={14} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div className="hero-foot">
          <div className="hero-stat">
            <div>
              <strong>24/7</strong>
              <span>Records available</span>
            </div>
            <div>
              <strong>CSV</strong>
              <span>Monthly reports</span>
            </div>
            <div>
              <strong>SMS</strong>
              <span>Due-date reminders</span>
            </div>
          </div>
          <span style={{ width: '100%' }}>
            © {new Date().getFullYear()} Group Hub Exclusive. It’s Us
          </span>
        </div>
      </div>

      <div className="auth-panel">
        <button
          className="icon-btn auth-back"
          onClick={toggle}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle colour theme"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="auth-card animate-in">
          <div className="row" style={{ marginBottom: 22 }}>
            <span className="icon-tile">
              <ReceiptText size={18} />
            </span>
            <span className="muted small">Member portal</span>
          </div>

          <h1>Welcome back</h1>
          <p className="auth-sub">Sign in with the credentials provided by your group admin.</p>

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="input-with-icon">
                <User size={16} />
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="e.g. johndoe"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  className="icon-btn input-action"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="alert error" style={{ marginBottom: 0 }}>
                <Info size={16} />
                {error}
              </div>
            )}

            <button className="btn block full-submit lg" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={17} className="spin-ico" style={{ position: 'static' }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="auth-note">
            <Info size={15} />
            Accounts are created by your group admin. If you cannot sign in, ask them to reset your
            password from your profile.
          </p>
        </div>
      </div>
    </div>
  );
}
