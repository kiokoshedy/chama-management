import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  UserPlus,
  HandCoins,
  CalendarClock,
  CheckCircle2,
  LayoutGrid,
  Rows3,
  Crown,
  X,
  Mail,
  Phone,
  CalendarDays,
  ShieldCheck,
  CircleUser,
  Wallet,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { PageHeader, EmptyState, Segmented } from '../components/ui.jsx';
import { fmt, deadlineState, currency } from '../format.js';

export default function Members() {
  const { member } = useAuth();
  const [params, setParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [query, setQuery] = useState(params.get('q') || '');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('grid');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = member.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.members(), api.contributions()])
      .then(([{ members: rows }, { contributions }]) => {
        if (cancelled) return;
        setMembers(rows);
        setContribs(contributions);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the search box in step with the URL so the topbar search can drive it.
  useEffect(() => {
    const urlQuery = params.get('q') || '';
    setQuery((current) => (current === urlQuery ? current : urlQuery));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')]);

  const updateQuery = (value) => {
    setQuery(value);
    const next = new URLSearchParams(params);
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    setParams(next, { replace: true });
  };

  const counts = useMemo(
    () => ({
      all: members.length,
      admins: members.filter((m) => m.role === 'admin').length,
      committee: members.filter((m) => m.designation).length,
    }),
    [members]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      const matchesQuery =
        !q ||
        m.display_name.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        (m.designation || '').toLowerCase().includes(q);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'admins' && m.role === 'admin') ||
        (filter === 'committee' && Boolean(m.designation));
      return matchesQuery && matchesFilter;
    });
  }, [members, query, filter]);

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Members"
        subtitle={`${members.length} ${members.length === 1 ? 'member' : 'members'} in this group — everyone can see who is in it and what they do.`}
        actions={
          <Segmented
            ariaLabel="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid', icon: LayoutGrid },
              { value: 'list', label: 'List', icon: Rows3 },
            ]}
          />
        }
      />

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div className="input-with-icon search-box" style={{ width: 'min(340px, 100%)' }}>
            <Search size={16} />
            <input
              placeholder="Search by name, username or role…"
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              aria-label="Search members"
            />
          </div>

          <div className="filter-pills">
            {[
              { key: 'all', label: 'Everyone' },
              { key: 'admins', label: 'Admins' },
              { key: 'committee', label: 'Committee' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-pill ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="count">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <CircleUser size={17} />
          {error}
        </div>
      )}

      {contribs.length > 0 && (
        <div className="card pad wide dash-contribs">
          <div className="card-title-row">
            <span className="icon-tile amber">
              <HandCoins size={18} />
            </span>
            <div>
              <h2>Open special contributions</h2>
              <p className="muted small">
                One-off collections running now, with the deadline set by your admin.
              </p>
            </div>
            <Link to="/payments" className="btn subtle sm" style={{ marginLeft: 'auto' }}>
              Manage in Payments
            </Link>
          </div>
          <div className="dash-contrib-list">
            {contribs.map((c) => {
              const ds = deadlineState(c.deadline);
              const st = c.mine?.state;
              return (
                <div className="dash-contrib-item" key={c.id}>
                  <div className="dash-contrib-info">
                    <strong>{c.title}</strong>
                    {c.description && <span className="muted small">{c.description}</span>}
                  </div>
                  <span className="contrib-amount" style={{ fontSize: 15 }}>
                    {fmt(c.amount)}
                  </span>
                  {st === 'approved' ? (
                    <span className="approved-tag">
                      <CheckCircle2 size={14} />
                      Approved
                    </span>
                  ) : (
                    <>
                      <span className={`deadline-chip ${ds.cls}`}>
                        <CalendarClock size={13} />
                        {ds.label}
                      </span>
                      {st === 'pending' ? (
                        <span className="badge status-requested">Awaiting approval</span>
                      ) : (
                        <span className="badge status-unpaid">Not paid</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="skeleton" key={i} style={{ height: 168 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={query ? Search : isAdmin ? UserPlus : Users}
          title={query ? 'No matches' : 'No members here'}
          description={
            query
              ? `Nothing matched "${query}". Try a different name or clear the filters.`
              : isAdmin
                ? 'Add your first member from the Admin dashboard.'
                : 'Members will appear here once added by your admin.'
          }
        />
      ) : view === 'grid' ? (
        <div className="grid">
          {filtered.map((m) => (
            <button
              className="card member-card"
              key={m.id}
              onClick={() => setSelected(m)}
              style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
            >
              <div className="member-head">
                <Avatar name={m.display_name} />
                <div>
                  <div className="member-name">{m.display_name}</div>
                  <div className="member-handle">
                    {m.username === member.username ? 'You' : `@${m.username}`}
                  </div>
                </div>
              </div>
              <div className="badge-row">
                {m.designation && <span className="badge designation">{m.designation}</span>}
                {isAdmin ? (
                  <>
                    <span className={`badge ${m.role}`}>{m.role}</span>
                    {m.status && m.status !== 'active' && (
                      <span className={`badge role-${m.status}`}>
                        {m.status === 'suspended' ? 'Suspended' : 'Expelled'}
                      </span>
                    )}
                  </>
                ) : (
                  m.role === 'admin' && <span className={`badge ${m.role}`}>{m.role}</span>
                )}
              </div>
              {m.bio && <p className="bio">{m.bio}</p>}
            </button>
          ))}
        </div>
      ) : (
        <div className="member-list">
          {filtered.map((m) => (
            <button
              className="member-list-row"
              key={m.id}
              onClick={() => setSelected(m)}
              style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
            >
              <Avatar name={m.display_name} className="sm" />
              <div className="member-main">
                <strong>{m.display_name}</strong>
                <span>
                  @{m.username}
                  {m.designation ? ` · ${m.designation}` : ''}
                </span>
              </div>
              {m.role === 'admin' && <span className="badge admin">Admin</span>}
              {m.designation && <span className="badge designation">{m.designation}</span>}
              {isAdmin && m.status !== 'active' && (
                <span className={`badge role-${m.status}`}>
                  {m.status === 'suspended' ? 'Suspended' : 'Expelled'}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <MemberDrawer member={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function MemberDrawer({ member, isAdmin, onClose }) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={member.display_name}>
        <div className="drawer-head">
          <Avatar name={member.display_name} className="lg" />
          <div>
            <h2 className="section-title">{member.display_name}</h2>
            <p className="muted small">@{member.username}</p>
            <div className="badge-row">
              {member.designation && <span className="badge designation">{member.designation}</span>}
              {isAdmin && <span className={`badge ${member.role}`}>{member.role}</span>}
              {isAdmin && member.status !== 'active' && (
                <span className={`badge role-${member.status}`}>
                  {member.status === 'suspended' ? 'Suspended' : 'Expelled'}
                </span>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="drawer-body">
          {member.bio && (
            <div className="card pad" style={{ marginBottom: 16, background: 'var(--surface-2)' }}>
              <p className="muted" style={{ lineHeight: 1.6 }}>
                {member.bio}
              </p>
            </div>
          )}

          <dl className="detail-list">
            <div className="detail-row">
              <dt>
                <CircleUser size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Username
              </dt>
              <dd className="mono">@{member.username}</dd>
            </div>
            {member.designation && (
              <div className="detail-row">
                <dt>
                  <Crown size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Role in the group
                </dt>
                <dd>{member.designation}</dd>
              </div>
            )}
            <div className="detail-row">
              <dt>
                <ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Access
              </dt>
              <dd>{isAdmin ? member.role : member.role === 'admin' ? 'Administrator' : 'Member'}</dd>
            </div>
            {member.phone && (
              <div className="detail-row">
                <dt>
                  <Phone size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Mobile
                </dt>
                <dd className="mono">{member.phone}</dd>
              </div>
            )}
            {member.created_at && (
              <div className="detail-row">
                <dt>
                  <CalendarDays size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Member since
                </dt>
                <dd>{member.created_at}</dd>
              </div>
            )}
            {isAdmin && member.status !== 'active' && member.status_reason && (
              <div className="detail-row">
                <dt>Reason</dt>
                <dd>{member.status_reason}</dd>
              </div>
            )}
          </dl>

          {!isAdmin && (
            <p className="muted small" style={{ marginTop: 18 }}>
              <Mail size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Contact details are only visible to the group admin.
            </p>
          )}

          <Link to="/payments" className="btn ghost block" style={{ marginTop: 18 }}>
            <Wallet size={15} />
            Go to payments
          </Link>
          <p className="muted small" style={{ marginTop: 12, textAlign: 'center' }}>
            Contributions are recorded in {currency}.
          </p>
        </div>
      </aside>
    </>
  );
}
