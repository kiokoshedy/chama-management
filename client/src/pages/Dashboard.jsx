import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Wallet,
  HandCoins,
  CheckCircle2,
  Clock3,
  CalendarClock,
  TrendingUp,
  UserPlus,
  Download,
  ArrowRight,
  ShieldCheck,
  ScrollText,
  Sparkles,
  CircleAlert,
  Crown,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { StatCard, SectionCard, EmptyState } from '../components/ui.jsx';
import { fmt, monthShort, timeAgo, greeting, deadlineState } from '../format.js';

// The landing page. Members see their own contribution position, admins see the
// group's position and anything waiting for a decision.

const ACTIVITY = {
  paid: { icon: CheckCircle2, tone: 'green', verb: 'payment recorded' },
  requested: { icon: Clock3, tone: 'blue', verb: 'sent payment proof' },
  unpaid: { icon: CircleAlert, tone: 'amber', verb: 'is still outstanding' },
};

function activityStamp(payment) {
  return payment.proof?.received_at || payment.paid_at || payment.created_at || null;
}

function buildChart(payments) {
  const totals = new Map();
  payments.forEach((p) => {
    const current = totals.get(p.period) || 0;
    totals.set(p.period, current + (p.status === 'paid' ? Number(p.total || 0) : 0));
  });
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([period, value]) => ({ period, value }));
}

export default function Dashboard() {
  const { member } = useAuth();
  const isAdmin = member.role === 'admin';
  const [payments, setPayments] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [paymentData, contribData, memberData] = await Promise.all([
          isAdmin ? api.adminPayments() : api.paymentsMe(),
          isAdmin ? api.adminContributions() : api.contributions(),
          api.members(),
        ]);
        if (cancelled) return;
        setPayments(paymentData.payments);
        setContribs(contribData.contributions);
        setMembers(memberData.members);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const chart = useMemo(() => buildChart(payments), [payments]);
  const chartMax = Math.max(1, ...chart.map((c) => c.value));

  const activity = useMemo(() => {
    const rows = [...payments].sort((a, b) => {
      const at = activityStamp(a) || '';
      const bt = activityStamp(b) || '';
      return String(bt).localeCompare(String(at));
    });
    return rows.slice(0, 6);
  }, [payments]);

  const totals = useMemo(() => {
    const collected = payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.total || 0), 0);
    const requested = payments.filter((p) => p.status === 'requested').length;
    const unpaid = payments.filter((p) => p.status === 'unpaid').length;
    const outstanding = payments
      .filter((p) => p.status !== 'paid')
      .reduce((sum, p) => sum + Number(p.total || 0), 0);
    return { collected, requested, unpaid, outstanding };
  }, [payments]);

  const currentPeriod = payments[0]?.period;
  const currentStats = useMemo(() => {
    if (!currentPeriod) return { collected: 0, paid: 0, requested: 0, unpaid: 0, members: 0 };
    const rows = payments.filter((p) => p.period === currentPeriod);
    return {
      collected: rows
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + Number(p.total || 0), 0),
      paid: rows.filter((p) => p.status === 'paid').length,
      requested: rows.filter((p) => p.status === 'requested').length,
      unpaid: rows.filter((p) => p.status === 'unpaid').length,
      members: rows.length,
    };
  }, [payments, currentPeriod]);

  const openContribs = contribs.filter((c) => c.is_active !== false);
  const committee = members.filter(
    (m) => m.role === 'admin' || (m.designation && m.designation !== '')
  );
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div>
        <div className="dash-hero">
          <div className="dash-hero-copy">
            <div className="skeleton" style={{ height: 28, width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 15, width: '70%' }} />
          </div>
        </div>
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton" key={i} style={{ height: 118 }} />
          ))}
        </div>
        <div className="dash-grid">
          <div className="skeleton" style={{ height: 320 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="dash-hero">
        <Avatar name={member.display_name} className="xl" />
        <div className="dash-hero-copy">
          <h1>
            {greeting()}, {member.display_name.split(' ')[0]}
          </h1>
          <p>
            {today} · {isAdmin ? 'Here is how the group is doing.' : 'Here is where you stand.'}
          </p>
        </div>
        <div className="dash-hero-actions">
          <Link to="/payments" className="btn">
            <Wallet size={16} />
            {isAdmin ? 'Review payments' : 'My payments'}
          </Link>
          {isAdmin ? (
            <Link to="/admin" className="btn ghost">
              <UserPlus size={16} />
              Add member
            </Link>
          ) : (
            <Link to="/members" className="btn ghost">
              <Users size={16} />
              Directory
            </Link>
          )}
        </div>
      </section>

      {error && (
        <div className="alert error">
          <CircleAlert size={17} />
          {error}
        </div>
      )}

      <div className="stat-grid">
        {isAdmin ? (
          <>
            <StatCard
              label="Collected this month"
              value={fmt(currentStats.collected)}
              hint={currentPeriod ? monthShort(currentPeriod) : 'No period yet'}
              icon={Wallet}
              tone="green"
            />
            <StatCard
              label="Members"
              value={members.length}
              hint={`${members.filter((m) => m.role === 'admin').length} administrators`}
              icon={Users}
            />
            <StatCard
              label="Awaiting approval"
              value={currentStats.requested}
              hint={currentStats.requested === 1 ? 'Request to review' : 'Requests to review'}
              icon={Clock3}
              tone="blue"
            />
            <StatCard
              label="Still unpaid"
              value={currentStats.unpaid}
              hint={`of ${currentStats.members} billed this month`}
              icon={CircleAlert}
              tone="amber"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Total contributed"
              value={fmt(totals.collected)}
              hint="Across all approved payments"
              icon={Wallet}
              tone="green"
            />
            <StatCard
              label="Outstanding"
              value={fmt(totals.outstanding)}
              hint={`${totals.unpaid} payment${totals.unpaid === 1 ? '' : 's'} not cleared`}
              icon={CircleAlert}
              tone="amber"
            />
            <StatCard
              label="Awaiting approval"
              value={totals.requested}
              hint="Proof sent to your admin"
              icon={Clock3}
              tone="blue"
            />
            <StatCard
              label="Open contributions"
              value={openContribs.length}
              hint="Special collections running now"
              icon={HandCoins}
              tone="violet"
            />
          </>
        )}
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <section className="card pad">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <div className="section-head">
                <span className="icon-tile">
                  <TrendingUp size={18} />
                </span>
                <div>
                  <h2 className="section-title">Contributions collected</h2>
                  <p className="muted small">Approved payments per month</p>
                </div>
              </div>
            </div>
            {chart.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nothing to chart yet"
                description="Once payments are approved, the monthly totals show up here."
              />
            ) : (
              <div className="chart">
                {chart.map((c, i) => (
                  <div className="chart-col" key={c.period}>
                    <div className="chart-bar-wrap">
                      <div
                        className="chart-bar"
                        style={{ height: `${Math.max(4, (c.value / chartMax) * 100)}%`, animationDelay: `${i * 60}ms` }}
                      >
                        <span className="chart-value">{fmt(c.value)}</span>
                      </div>
                    </div>
                    <span className="chart-label">{monthShort(c.period)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card pad">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="section-head">
                <span className="icon-tile blue">
                  <Clock3 size={18} />
                </span>
                <div>
                  <h2 className="section-title">Recent activity</h2>
                  <p className="muted small">The latest movement on payments</p>
                </div>
              </div>
              <Link to="/payments" className="btn subtle sm">
                View all
                <ArrowRight size={14} />
              </Link>
            </div>

            {activity.length === 0 ? (
              <p className="muted small">No payment activity recorded yet.</p>
            ) : (
              <div className="activity-list">
                {activity.map((p) => {
                  const meta = ACTIVITY[p.status] || ACTIVITY.unpaid;
                  const Icon = meta.icon;
                  const when = timeAgo(activityStamp(p));
                  return (
                    <div className="activity-item" key={p.id}>
                      <span className={`activity-icon ${meta.tone}`}>
                        <Icon size={16} />
                      </span>
                      <div className="activity-copy">
                        <strong>
                          {isAdmin ? p.display_name : p.period} {meta.verb}
                        </strong>
                        <span>
                          {monthShort(p.period)} · {p.status === 'requested' ? 'awaiting approval' : p.status}
                          {when ? ` · ${when}` : ''}
                        </span>
                      </div>
                      <span className="activity-amount">{fmt(p.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="dash-col">
          <section className="card pad">
            <div className="section-head" style={{ marginBottom: 14 }}>
              <span className="icon-tile amber">
                <CalendarClock size={18} />
              </span>
              <div>
                <h2 className="section-title">Upcoming deadlines</h2>
                <p className="muted small">Special contributions closing soon</p>
              </div>
            </div>

            {openContribs.length === 0 ? (
              <p className="muted small">No special contributions are running right now.</p>
            ) : (
              <div className="deadline-list">
                {openContribs.slice(0, 5).map((c) => {
                  const ds = deadlineState(c.deadline);
                  return (
                    <div className="deadline-item" key={c.id}>
                      <div className="deadline-item-copy">
                        <strong>{c.title}</strong>
                        <span>{fmt(c.amount)}</span>
                      </div>
                      <span className={`deadline-chip ${ds.cls}`}>{ds.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card pad">
            <div className="section-head" style={{ marginBottom: 14 }}>
              <span className="icon-tile violet">
                <Crown size={18} />
              </span>
              <div>
                <h2 className="section-title">The committee</h2>
                <p className="muted small">Admins and office bearers</p>
              </div>
            </div>

            {committee.length === 0 ? (
              <p className="muted small">No office bearers have been named yet.</p>
            ) : (
              <div className="activity-list">
                {committee.slice(0, 6).map((m) => (
                  <div className="activity-item" key={m.id}>
                    <Avatar name={m.display_name} className="sm" />
                    <div className="activity-copy">
                      <strong>{m.display_name}</strong>
                      <span>
                        {m.designation || (m.role === 'admin' ? 'Administrator' : 'Member')}
                        {m.role === 'admin' ? ' · Admin' : ''}
                      </span>
                    </div>
                    {m.role === 'admin' && <ShieldCheck size={15} />}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card pad">
            <div className="section-head" style={{ marginBottom: 14 }}>
              <span className="icon-tile green">
                <Sparkles size={18} />
              </span>
              <div>
                <h2 className="section-title">Quick actions</h2>
                <p className="muted small">Jump straight to what you need</p>
              </div>
            </div>
            <div className="quick-actions">
              <Link to="/payments" className="quick-action">
                <Download size={16} />
                Month report
              </Link>
              <Link to="/members" className="quick-action">
                <Users size={16} />
                Members
              </Link>
              <Link to="/constitution" className="quick-action">
                <ScrollText size={16} />
                Constitution
              </Link>
              {isAdmin && (
                <Link to="/admin" className="quick-action">
                  <ShieldCheck size={16} />
                  Admin tools
                </Link>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
