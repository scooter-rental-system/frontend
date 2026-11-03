import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ErrorAlert, Loading } from '../../components/ui';
import { date, dateTime, money, today } from '../../format';
import { useLoad } from '../../hooks';
import { dashboardKpis, fleetBreakdown, initials } from '../../admin';
import { SPEED_LIMIT_KMH } from '../../rental';
import { adminBookingPath } from '../../routes';
import type { Booking, Dashboard as DashboardData, SpeedViolation } from '../../types';

type Flag = { text: string; tone: 'red' | 'amber' };

// Figma "Admin Dashboard v3": metric cards, work queues, a critical-alerts column and live fleet status. Every
// figure comes from GET /admin/dashboard or the booking lists; there are no derived trends or invented metrics.
// Each queue's count is the length of its own list, so the cards and lists always agree.
export default function Dashboard() {
  const stats = useLoad(() => api.get<DashboardData>('/admin/dashboard'));
  const pending = useLoad(() => api.get<Booking[]>('/admin/bookings?status=PENDING'));
  const active = useLoad(() => api.get<Booking[]>('/admin/bookings?status=ACTIVE'));
  // Paid and waiting for the handover and the customer's start.
  const ready = useLoad(() => api.get<Booking[]>('/admin/bookings?status=READY_FOR_PICKUP'));

  if (stats.loading && !stats.data) return <Loading />;
  if (!stats.data) return <ErrorAlert error={stats.error} />;
  const d = stats.data;

  const byStart = (a: Booking, b: Booking) => a.startTime.localeCompare(b.startTime);
  const awaitingPayment = [...(pending.data ?? [])].sort(byStart);
  const upcoming = [...(ready.data ?? []), ...(active.data ?? []).filter((b) => b.stage === 'UPCOMING')].sort(byStart);
  const inProgress = (active.data ?? []).filter((b) => b.stage === 'IN_PROGRESS').sort(byStart);
  const balanceDue = (active.data ?? []).filter((b) => b.stage === 'BALANCE_DUE').sort(byStart);

  const paymentFlag = (b: Booking): Flag | null =>
    b.stage === 'PAYMENT_FAILED' ? { text: 'Payment failed', tone: 'red' } : null;
  const dueFlag = (b: Booking): Flag | null => ({ text: `Due ${money(b.payment?.balanceDue)}`, tone: 'red' });

  const refresh = () => {
    stats.reload();
    pending.reload();
    active.reload();
    ready.reload();
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Today, {date(today())}</span>
          <h1>
            Operations <span className="accent-text">overview</span>
          </h1>
          <p className="muted">Bookings, payments and the fleet as the server reports them now.</p>
        </div>
        <div className="admin-page__actions">
          <button type="button" onClick={refresh} disabled={stats.loading}>
            {stats.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      <ErrorAlert error={stats.error ?? pending.error ?? active.error} />

      <section aria-labelledby="overview-title">
        <h2 id="overview-title" className="sr-only">
          Overview
        </h2>
        <div className="kpi-grid">
          {dashboardKpis(d).map((k) => (
            <div key={k.label} className={`kpi${k.attention ? ' is-attention' : ''}`}>
              <div className="kpi__label">{k.label}</div>
              <div className="kpi__value">{k.value}</div>
              <div className="kpi__hint">
                {k.hint}
                {k.attention && <span className="kpi__flag"> · Needs attention</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel-card" aria-labelledby="work-title">
          <div className="panel-card__head">
            <div>
              <h2 id="work-title">Today&apos;s work</h2>
              <p className="muted small">In rental order: payment → start → on the road → ended. Customers end their own rentals.</p>
            </div>
            <Link to="/admin/bookings">All bookings</Link>
          </div>
          <div className="queue-grid">
            <BookingQueue title="1. Awaiting payment" bookings={awaitingPayment} flag={paymentFlag} empty="No unpaid bookings." />
            <BookingQueue title="2. Ready for pickup" bookings={upcoming} empty="No bookings waiting for pickup." />
            <BookingQueue title="3. On the road" bookings={inProgress} empty="No rentals in progress." />
            <BookingQueue title="4. Balance due" bookings={balanceDue} flag={dueFlag} empty="No balances due." />
          </div>
        </section>

        <div className="dash-side">
          <SpeedViolations />

          <section className="panel-card" aria-labelledby="fleet-title">
            <div className="panel-card__head">
              <h2 id="fleet-title">Fleet status</h2>
              <Link to="/admin/fleet">Manage scooters</Link>
            </div>
            <ul className="meter-list">
              {fleetBreakdown(d).map((f) => (
                <li key={f.label}>
                  <div className="meter__row">
                    <span>{f.label}</span>
                    <span>
                      {f.count} · {f.share}%
                    </span>
                  </div>
                  <div className={`meter ${f.tone === 'blue' ? '' : f.tone}`} aria-hidden>
                    <span style={{ width: `${f.share}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small" style={{ marginTop: 'var(--space-4)' }}>
              {d.openMaintenance} open maintenance job{d.openMaintenance === 1 ? '' : 's'} ·{' '}
              <Link to="/admin/maintenance">Maintenance</Link>
            </p>
          </section>

          <section className="panel-card" aria-labelledby="business-title">
            <div className="panel-card__head">
              <h2 id="business-title">Business</h2>
              <Link to="/admin/reports">Open reports</Link>
            </div>
            <div className="kpi-grid">
              <div className="kpi kpi--accent">
                <div className="kpi__label">Revenue, last 30 days</div>
                <div className="kpi__value">{money(d.revenueLast30Days)}</div>
                <div className="kpi__hint">Payments collected</div>
              </div>
              <div className="kpi">
                <div className="kpi__label">Registered customers</div>
                <div className="kpi__value">{d.customers}</div>
                <div className="kpi__hint">All time</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** SDS 5.2: speed-violation alerts (over 60 km/h), announced politely to screen readers as they arrive. */
function SpeedViolations() {
  const [items, setItems] = useState<SpeedViolation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<SpeedViolation[]>('/admin/gps/speed-violations?limit=10')
        .then((v) => {
          if (!cancelled) {
            setItems(v);
            setError(null);
          }
        })
        .catch((e) => !cancelled && setError(e.message));
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel-card" aria-labelledby="speed-violations-title">
      <div className="panel-card__head">
        <h2 id="speed-violations-title">Speed violations</h2>
        <span className="live-pill">Over {SPEED_LIMIT_KMH} km/h</span>
      </div>
      <p className="muted small">Recorded by the server from GPS reports; the latest 10, refreshed every 30 seconds.</p>
      <ErrorAlert error={error} />
      <div aria-live="polite" aria-relevant="additions" style={{ marginTop: 'var(--space-3)' }}>
        {items?.length === 0 && <p className="muted">No speed violations recorded.</p>}
        {items && items.length > 0 && (
          <ul className="alert-feed">
            {items.map((v) => (
              <li key={v.id} className="alert-card">
                <span className="alert-card__title">
                  {v.scooterCode} · {Math.round(v.speedKmh)} km/h
                </span>
                <span className="alert-card__meta">
                  {v.scooterModel} ({v.plateNumber}) · {v.bookingReference ? `${v.bookingReference}, ${v.riderName}` : 'not on a rental'}
                </span>
                <span className="alert-card__foot">
                  <span className="alert-card__meta">
                    {dateTime(v.recordedAt)} · {v.latitude}, {v.longitude}
                  </span>
                  <span className="badge red">Over limit</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="small" style={{ marginTop: 'var(--space-3)' }}>
        <Link to="/admin/gps">Open live GPS</Link>
      </p>
    </section>
  );
}

function BookingQueue({
  title,
  bookings,
  empty,
  flag,
}: {
  title: string;
  bookings: Booking[];
  empty: string;
  flag?: (b: Booking) => Flag | null;
}) {
  return (
    <div className="queue">
      <div className="queue__head">
        <h3>
          {title}
          <span className="queue__count">{bookings.length}</span>
        </h3>
      </div>
      {bookings.length === 0 && <p className="muted small">{empty}</p>}
      {bookings.length > 0 && (
        <ul className="queue__list">
          {bookings.map((b) => {
            const f = flag?.(b);
            return (
              <li key={b.id} className="queue__item">
                <div className="queue__who">
                  <span className="avatar" aria-hidden>
                    {initials(b.customer.fullName)}
                  </span>
                  <div>
                    <strong>{b.customer.fullName}</strong> · {b.scooter.code}
                    <div className="muted small">
                      <Link to={adminBookingPath(b.id)}>{b.reference}</Link> · from {dateTime(b.startTime)}
                    </div>
                  </div>
                </div>
                {f && <span className={`badge ${f.tone}`}>{f.text}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
