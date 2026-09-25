import { useEffect, useState } from 'react';
import { Users, Search, UserPlus, HandCoins, CalendarClock, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../App.jsx';
import { fmt, deadlineState, currency } from '../format.js';
import { Link } from 'react-router-dom';

export default function Members() {
  const { member } = useAuth();
  const [members, setMembers] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const isAdmin = member.role === 'admin';

  useEffect(() => {
    Promise.all([api.members(), api.contributions()])
      .then(([{ members }, { contributions }]) => {
        setMembers(members);
        setContribs(contributions);
      })
      .catch((e) => setError(e.message));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = members.filter(
    (m) =>
      !q ||
      m.display_name.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q)
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Members</h1>
          <p className="page-sub">
            Your group directory — {members.length} {members.length === 1 ? 'member' : 'members'} in total.
          </p>
        </div>
        <div className="page-header-actions">
          <div className="input-with-icon search-box">
            <Search size={16} />
            <input
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {contribs.length > 0 && (
        <div className="card pad wide dash-contribs">
          <div className="card-title-row">
            <span className="icon-tile amber">
              <HandCoins size={18} />
            </span>
            <div>
              <h2>Open special contributions</h2>
              <p className="muted small">
                One-off collections with deadlines set by your admin under the {currency} banner.
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
                  <span className="contrib-amount" style={{ fontSize: 15 }}>{fmt(c.amount)}</span>
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

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon-tile blue">
            {isAdmin ? <UserPlus size={22} /> : <Users size={22} />}
          </div>
          <h3>{q ? 'No matches' : 'No members yet'}</h3>
          <p>
            {q
              ? `Nothing matched "${query}".`
              : isAdmin
                ? 'Add your first member from the Admin dashboard.'
                : 'Members will appear here once added by your admin.'}
          </p>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((m) => (
            <div className="card member-card" key={m.id}>
              <div className="member-head">
                <Avatar name={m.display_name} />
                <div>
                  <div className="member-name">{m.display_name}</div>
                  {m.username !== member.username && (
                    <div className="member-handle">@{m.username}</div>
                  )}
                  {m.username === member.username && <div className="member-handle">You</div>}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}