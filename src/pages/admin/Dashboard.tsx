import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ErrorAlert, Loading, Stat } from '../../components/ui';
import { date, dateTime, money, today } from '../../format';
import { useLoad } from '../../hooks';
import { dashboardKpis } from '../../admin';
import { SPEED_LIMIT_KMH } from '../../rental';
import { adminBookingPath } from '../../routes';
import type { Booking, Dashboard as DashboardData, SpeedViolation } from '../../types';

type Flag = { text: string; tone: 'red' | 'amber' };

// Each step's count is the length of its own list, so the tiles and lists always agree.
export default function Dashboard() {
  const stats = useLoad(() => api.get<DashboardData>('/admin/dashboard'));
  const pending = useLoad(() => api.get<Booking[]>('/admin/bookings?status=PENDING'));
  const active = useLoad(() => api.get<Booking[]>('/admin/bookings?status=ACTIVE'));

  if (stats.loading) return <Loading />;
  if (!stats.data) return <ErrorAlert error={stats.error} />;
  const d = stats.data;

  const byStart = (a: Booking, b: Booking) => a.startTime.localeCompare(b.startTime);
  const awaitingPayment = [...(pending.data ?? [])].sort(byStart);
  const upcoming = (active.data ?? []).filter((b) => b.stage === 'UPCOMING').sort(byStart);
  const inProgress = (active.data ?? []).filter((b) => b.stage === 'IN_PROGRESS').sort(byStart);
  const balanceDue = (active.data ?? []).filter((b) => b.stage === 'BALANCE_DUE').sort(byStart);

  const paymentFlag = (b: Booking): Flag | null =>
    b.stage === 'PAYMENT_FAILED' ? { text: 'Payment failed', tone: 'red' } : null;
  const dueFlag = (b: Booking): Flag | null => ({ text: `Due ${money(b.payment?.balanceDue)}`, tone: 'red' });

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Today, {date(today())}</p>
        </div>
      </div>

      <section aria-labelledby="overview-title" className="stack">
        <h2 id="overview-title" className="section-title">
          Overview
        </h2>
        <div className="kpi-grid">
          {dashboardKpis(d).map((k) => (
            <div key={k.label} className={`stat kpi${k.attention ? ' is-attention' : ''}`}>
              <div className="stat__label">{k.label}</div>
              <div className="stat__value">{k.value}</div>
              <div className="muted small">
                {k.hint}
                {k.attention && <span className="kpi__flag"> · Needs attention</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="work-title">
        <div>
          <h2 id="work-title" className="section-title">
            Today&apos;s work
          </h2>
          <p className="muted small">In rental order: payment → start → on the road → ended. Customers end their own rentals.</p>
        </div>
        <div className="grid-2">
          <BookingList title="1. Awaiting payment" bookings={awaitingPayment} flag={paymentFlag} empty="No unpaid bookings." />
          <BookingList title="2. Starting soon" bookings={upcoming} empty="No upcoming rentals." />
          <BookingList title="3. On the road" bookings={inProgress} empty="No rentals in progress." />
          <BookingList title="4. Balance due" bookings={balanceDue} flag={dueFlag} empty="No balances due." />
        </div>
      </section>

      <SpeedViolations />

      <div className="grid-2">
        <section className="card stack" aria-labelledby="fleet-title">
          <h2 id="fleet-title">Fleet</h2>
          <div className="stats">
            <Stat label="Available" value={d.fleetByStatus.AVAILABLE ?? 0} hint="In the yard, bookable" />
            <Stat label="Rented" value={d.fleetByStatus.RENTED ?? 0} hint="On a paid booking" />
            <Stat
              label="In workshop"
              value={d.fleetByStatus.MAINTENANCE ?? 0}
              hint={`${d.openMaintenance} open maintenance job${d.openMaintenance === 1 ? '' : 's'}`}
            />
          </div>
          <Link to="/admin/fleet" className="small">
            Manage scooters
          </Link>
        </section>

        <section className="card stack" aria-labelledby="business-title">
          <h2 id="business-title">Business</h2>
          <div className="stats">
            <Stat label="Revenue, last 30 days" value={money(d.revenueLast30Days)} hint="Payments collected" />
            <Stat label="Registered customers" value={d.customers} hint="All time" />
          </div>
          <Link to="/admin/reports" className="small">
            Open reports
          </Link>
        </section>
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
    <section className="card stack" aria-labelledby="speed-violations-title">
      <div className="row between">
        <h2 id="speed-violations-title">
          Speed violations <span className="muted small">(over {SPEED_LIMIT_KMH} km/h)</span>
        </h2>
        <Link to="/admin/gps" className="small">
          Live GPS
        </Link>
      </div>
      <p className="muted small">Recorded by the server from GPS reports; the latest 10, refreshed every 30 seconds.</p>
      <ErrorAlert error={error} />
      <div aria-live="polite" aria-relevant="additions">
        {items?.length === 0 && <p className="muted">No speed violations recorded.</p>}
        {items && items.length > 0 && (
          <ul className="violation-list">
            {items.map((v) => (
              <li key={v.id}>
                <div>
                  <strong>{v.scooterCode}</strong> · {v.scooterModel} ({v.plateNumber})
                  <div className="muted small">
                    {dateTime(v.recordedAt)} · {v.bookingReference ? `${v.bookingReference}, ${v.riderName}` : 'not on a rental'} ·{' '}
                    {v.latitude}, {v.longitude}
                  </div>
                </div>
                <span className="badge red">
                  {Math.round(v.speedKmh)} km/h · over limit
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function BookingList({
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
    <div className="card stack">
      <div className="row between">
        <h3 style={{ margin: 0 }}>
          {title} <span className="muted">({bookings.length})</span>
        </h3>
        <Link to="/admin/bookings" className="small">
          All bookings
        </Link>
      </div>
      {bookings.length === 0 && <p className="muted">{empty}</p>}
      {bookings.map((b) => {
        const f = flag?.(b);
        return (
          <div key={b.id} className="row between">
            <div>
              <strong>{b.scooter.code}</strong> · {b.customer.fullName}
              <div className="muted small">
                <Link to={adminBookingPath(b.id)}>{b.reference}</Link> · from {dateTime(b.startTime)}
              </div>
            </div>
            {f && <span className={`badge ${f.tone}`}>{f.text}</span>}
          </div>
        );
      })}
    </div>
  );
}
