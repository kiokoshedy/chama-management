import { useEffect, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  NavLink,
  useLocation,
  useNavigate,
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
  LayoutDashboard,
  Sun,
  Moon,
  Search,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { useTheme } from './theme.jsx';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import Payments from './pages/Payments.jsx';
import Constitution from './pages/Constitution.jsx';
import Admin from './pages/Admin.jsx';
import Profile from './pages/Profile.jsx';
import { AppealPanel } from './AppealPanel.jsx';
import { Avatar } from './components/Avatar.jsx';

export { Avatar };

const NAV = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/members', label: 'Members', icon: Users },
    ],
  },
  {
    label: 'Group',
    items: [
      { to: '/payments', label: 'Payments', icon: Wallet },
      { to: '/constitution', label: 'Constitution', icon: ScrollText },
    ],
  },
  {
    label: 'Account',
    items: [{ to: '/profile', label: 'Profile', icon: UserCircle }],
  },
];

const TITLES = [
  { test: (p) => p === '/', label: 'Dashboard', crumb: 'Overview' },
  { test: (p) => p.startsWith('/members'), label: 'Members', crumb: 'Directory' },
  { test: (p) => p.startsWith('/payments'), label: 'Payments', crumb: 'Contributions' },
  { test: (p) => p.startsWith('/constitution'), label: 'Constitution', crumb: 'Documents' },
  { test: (p) => p.startsWith('/admin'), label: 'Admin', crumb: 'Administration' },
  { test: (p) => p.startsWith('/profile'), label: 'Profile', crumb: 'Account' },
];

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

function UserMenu({ member, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={member.display_name} className="sm" />
        <span className="user-menu-name">
          <strong>{member.display_name}</strong>
          <span>@{member.username}</span>
        </span>
        <ChevronDown size={15} className={open ? 'rotate' : ''} />
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <Avatar name={member.display_name} />
            <div>
              <strong>{member.display_name}</strong>
              <span>@{member.username}</span>
            </div>
          </div>
          <button
            className="user-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
          >
            <Settings size={15} />
            Profile settings
          </button>
          <button
            className="user-menu-item danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Shell({ member, logout }) {
  const [navOpen, setNavOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [search, setSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();
  const closeNav = () => setNavOpen(false);

  const current = TITLES.find((t) => t.test(location.pathname)) || {
    label: 'Group Hub',
    crumb: '',
  };

  // Admin badge: how many payment requests are waiting for a decision.
  useEffect(() => {
    if (member.role !== 'admin') return undefined;
    let cancelled = false;
    api
      .adminPayments()
      .then(({ payments }) => {
        if (cancelled) return;
        setPendingApprovals(payments.filter((p) => p.status === 'requested').length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [member.role, location.pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/members?q=${encodeURIComponent(q)}` : '/members');
    setSearch('');
  };

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
          {NAV.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(({ to, label, icon: Icon, end }) => (
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
            </div>
          ))}

          {member.role === 'admin' && (
            <div>
              <div className="nav-label">Administration</div>
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={closeNav}
              >
                <ShieldCheck size={18} />
                Admin
                {pendingApprovals > 0 && <span className="nav-badge">{pendingApprovals}</span>}
              </NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <Avatar name={member.display_name} className="sm" />
          <div className="sidebar-user">
            <strong>{member.display_name}</strong>
            <span>@{member.username}</span>
          </div>
          <button className="icon-btn" title="Log out" onClick={logout} aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>

          <div className="topbar-lead">
            <span className="topbar-title">{current.label}</span>
            {current.crumb && <span className="topbar-crumb">/ {current.crumb}</span>}
          </div>

          <div className="topbar-spacer" />

          <form className="topbar-search hide-sm" onSubmit={submitSearch} role="search">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              aria-label="Search members"
            />
          </form>

          <div className="topbar-actions">
            <button
              className="icon-btn theme-toggle"
              onClick={toggle}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle colour theme"
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <span className="topbar-chip hide-sm">
              <span className="status-dot" />
              {member.role === 'admin' ? 'Administrator' : 'Member'}
            </span>

            <UserMenu member={member} logout={logout} />
          </div>
        </header>

        <main className="content">
          <div className="page-enter" key={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/members" element={<Members />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/constitution" element={<Constitution />} />
              <Route path="/profile" element={<Profile />} />
              {member.role === 'admin' && <Route path="/admin" element={<Admin />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
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
