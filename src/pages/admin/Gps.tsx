import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { gpsCounts } from '../../admin';
import MapView, { MapMarker } from '../../components/MapView';
import { ErrorAlert, StatusBadge } from '../../components/ui';
import { dateTime } from '../../format';
import { speedState } from '../../rental';
import { adminGpsHistoryPath } from '../../routes';
import type { LivePosition, Tracking } from '../../types';

export default function Gps() {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trail, setTrail] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<LivePosition[]>('/admin/gps/live')
        .then((p) => {
          if (!cancelled) {
            setPositions(p);
            setError(null);
          }
        })
        .catch((e) => !cancelled && setError(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (selected == null) {
      setTrail(null);
      return;
    }
    api.get<Tracking>(`/admin/gps/scooters/${selected}/trail?hours=6`).then(setTrail).catch((e) => setError(e.message));
  }, [selected, positions]);

  const markers: MapMarker[] = positions
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      id: p.scooterId,
      lat: p.latitude!,
      lng: p.longitude!,
      kind: p.stale ? 'STALE' : p.status,
      popup: (
        <div>
          <strong>{p.code}</strong> {p.model}
          <br />
          {p.plateNumber}
          {p.stale && (
            <>
              <br />
              <em>Last known position, no report since {dateTime(p.lastSeen)}</em>
            </>
          )}
          {p.riderName && (
            <>
              <br />
              Rider: {p.riderName} ({p.activeBookingReference})
            </>
          )}
        </div>
      ),
    }));

  const counts = gpsCounts(positions);
  const chosen = positions.find((p) => p.scooterId === selected) ?? null;
  // The newest point of the real 6-hour trail; no speed is shown when the tracker sent none.

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>
            Live <span className="accent-text">GPS</span>
          </h1>
          <p className="muted">
            Refreshes every 10 s, from scooter trackers and riders&apos; phones. Grey: no report for 2 minutes, so the
            marker is the last known position.
          </p>
        </div>
        <dl className="header-stats" aria-label="Tracking summary">
          <div className="header-stat">
            <dt>Reporting</dt>
            <dd>{counts.live}</dd>
          </div>
          <div className={`header-stat${counts.stale > 0 ? ' is-attention' : ''}`}>
            <dt>Stale</dt>
            <dd>{counts.stale}</dd>
          </div>
          <div className="header-stat">
            <dt>On a rental</dt>
            <dd>{counts.onRental}</dd>
          </div>
        </dl>
      </div>
      <ErrorAlert error={error} />

      <div className="gps-layout">
        <div className="gps-stage">
          <MapView markers={markers} trail={trail?.trail.map((t) => [t.latitude, t.longitude] as [number, number])} zoom={12} />
          <div className="gps-legend muted small" style={{ marginTop: 'var(--space-3)' }}>
            <span>
              <span className="gps-dot rented" aria-hidden /> Rented
            </span>
            <span>
              <span className="gps-dot available" aria-hidden /> Available
            </span>
            <span>
              <span className="gps-dot maintenance" aria-hidden /> Maintenance
            </span>
            <span>
              <span className="gps-dot stale" aria-hidden /> Stale (last known)
            </span>
            <span>Blue line: the selected scooter&apos;s last 6 hours</span>
          </div>
        </div>

        <div className="gps-side">
          {chosen && (
            <section className="panel-card" aria-labelledby="gps-selected-title" aria-live="polite">
              <div className="panel-card__head">
                <div>
                  <span className="eyebrow">{chosen.stale ? 'Last known position' : 'Live'}</span>
                  <h2 id="gps-selected-title">
                    {chosen.code} <span className="muted small">{chosen.model}</span>
                  </h2>
                </div>
                <StatusBadge status={chosen.status} />
              </div>
              <dl className="gps-readout">
                <div>
                  <dt>Last speed (approx.)</dt>
                  <dd>{speedState(trail?.trail, false).text}</dd>
                  {speedState(trail?.trail, false).over && <span className="badge red">Over limit (sustained)</span>}
                </div>
                <div>
                  <dt>6 h trail</dt>
                  <dd>{trail ? `${trail.distanceKm} km` : '—'}</dd>
                </div>
                <div>
                  <dt>From base</dt>
                  <dd>{chosen.distanceFromBaseKm} km</dd>
                </div>
                <div>
                  <dt>Last ping</dt>
                  <dd className="small">{chosen.lastSeen ? dateTime(chosen.lastSeen) : 'Never'}</dd>
                </div>
              </dl>
              <p className="muted small" style={{ marginTop: 'var(--space-3)' }}>
                {chosen.riderName ? `Rider: ${chosen.riderName} · ${chosen.activeBookingReference}` : 'Not on a rental.'}
              </p>
              {chosen.activeBookingId && (
                <p className="small">
                  <Link to={adminGpsHistoryPath(chosen.activeBookingId)}>View this rental&apos;s GPS history</Link>
                </p>
              )}
            </section>
          )}

          <section className="panel-card" aria-labelledby="gps-list-title">
            <div className="panel-card__head">
              <h2 id="gps-list-title">Tracked scooters</h2>
              <span className="muted small">{positions.length}</span>
            </div>
            {positions.length === 0 && !error && <p className="muted">No scooters are reporting yet.</p>}
            <ul className="gps-list">
              {positions.map((p) => (
                <li key={p.scooterId}>
                  <button
                    type="button"
                    className="gps-item"
                    aria-pressed={selected === p.scooterId}
                    onClick={() => setSelected(selected === p.scooterId ? null : p.scooterId)}
                  >
                    <span className="gps-item__head">
                      <span>
                        {p.code} <span className="muted small">{p.model}</span>
                      </span>
                      <StatusBadge status={p.status} />
                    </span>
                    <span className="muted small">
                      {p.riderName ? `${p.riderName} · ${p.activeBookingReference}` : 'No rider'} · {p.distanceFromBaseKm} km from base
                    </span>
                    <span className="small">
                      {p.lastSeen ? `Last ping ${dateTime(p.lastSeen)}` : 'Never reported'}
                      {p.stale && p.lastSeen && <span className="badge"> stale</span>}
                    </span>
                    <span className="small accent-text">{selected === p.scooterId ? 'Hide trail' : 'Show 6h trail'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
