import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LayoutGrid, ShieldCheck, Users, Wallet, Info, Loader2 } from 'lucide-react';

const POINTS = [
  { icon: Users, text: 'Keep track of every member in one place' },
  { icon: Wallet, text: 'Monitor contributions and monthly dues' },
  { icon: ShieldCheck, text: 'Member accounts managed by your group admin' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
            <LayoutGrid size={19} />
          </span>
          <strong>Group Hub</strong>
        </div>

        <div>
          <h2>Your group, organised and accounted for.</h2>
          <p className="hero-sub">
            A simple portal for members — connect with your group, stay on top of your
            contributions, and keep the constitution close at hand.
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

        <div className="hero-foot">© {new Date().getFullYear()} Group Hub · Member portal</div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="auth-sub">Sign in with the credentials provided by your group admin.</p>

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. johndoe"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>

            {error && <p className="error">{error}</p>}

            <button className="btn block full-submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={17} className="spinner sm" style={{ position: 'static' }} />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="auth-note">
            <Info size={15} />
            Accounts are created by your group admin.
          </p>
        </div>
      </div>
    </div>
  );
}