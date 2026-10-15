import { useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  NavLink,
  useLocation,
} from 'react-router-dom';
import {
  Users,
  Wallet,
  ScrollText,
  UserCircle,
  ShieldCheck,
  LayoutGrid,
  Menu,
  LogOut,
  Loader2,
  UserX,
  Ban,
  MailQuestion,
} from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Members from './pages/Members.jsx';
import Payments from './pages/Payments.jsx';
import Constitution from './pages/Constitution.jsx';
import Admin from './pages/Admin.jsx';
import Profile from './pages/Profile.jsx';
import { AppealPanel } from './AppealPanel.jsx';

const NAV = [
  { to: '/', label: 'Members', icon: Users, end: true },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/constitution', label: 'Constitution', icon: ScrollText },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

function Avatar({ name, className = '' }) {
  const variants = ['', 'alt-1', 'alt-2', 'alt-3', 'alt-4', 'alt-5'];
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={`avatar ${className} ${variants[seed % variants.length]}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export { Avatar };

const BLOCKED = {
  suspended: {
    icon: Ban,
    title: 'Account suspended',
    message:
      'Your account has been suspended by an administrator. You can no longer use the group portal until it is reactivated.',
  },
  expelled: {
    icon: UserX,
    title: 'You have been expelled',
    message:
      'Your membership in this group has been revoked. You can no longer access the group portal.',
  },
};

function BlockedScreen({ member, logout }) {
  const { icon: Icon, title, message } = BLOCKED[member.status] || {
    icon: MailQuestion,
    title: 'Account unavailable',
    message: 'Contact an administrator for more information.',
  };
  return (
    <div className="blocked-screen">
      <div className="blocked-card">
        <span className="blocked-icon">
          <Icon size={30} />
        </span>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="blocked-meta">
          <Avatar name={member.display_name} className="sm" />
          <span>
            <strong>{member.display_name}</strong>
            <span className="muted small">@{member.username}</span>
          </span>
        </div>
        <AppealPanel member={member} />
        <button className="btn ghost block" onClick={logout}>
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </div>
  );
}

function Shell({ member, logout }) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);
  const location = useLocation();
  const activeLabel =
    (location.pathname === '/' && 'Members') ||
    (location.pathname.startsWith('/payments') && 'Payments') ||
    (location.pathname.startsWith('/constitution') && 'Constitution') ||
    (location.pathname.startsWith('/admin') && 'Admin') ||
    (location.pathname.startsWith('/profile') && 'Profile') ||
    '';

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${navOpen ? 'show' : ''}`} onClick={closeNav} />

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">
            <LayoutGrid size={19} />
          </span>
          <span className="brand-text">
            <strong>Kwani Si Udo?</strong>
            <span>It's Us</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Overview</div>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={closeNav}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {member.role === 'admin' && (
            <>
              <div className="nav-label">Administration</div>
              <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeNav}>
                <ShieldCheck size={18} />
                Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <Avatar name={member.display_name} className="sm" />
          <div className="sidebar-user">
            <strong>{member.display_name}</strong>
            <span>@{member.username}</span>
          </div>
          <button className="icon-btn" title="Log out" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <span className="topbar-title">{activeLabel}</span>
          <div className="topbar-spacer" />
          <span className="topbar-chip hide-sm">
            <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#12b76a', display: 'inline-block' }} />
            Signed in as {member.username}
          </span>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Members />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/constitution" element={<Constitution />} />
            <Route path="/profile" element={<Profile />} />
            {member.role === 'admin' && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { member, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-box">
          <div className="spinner" />
          Loading your workspace…
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={member ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          member ? (
            member.status !== 'active' ? (
              <BlockedScreen member={member} logout={logout} />
            ) : (
              <Shell member={member} logout={logout} />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}