import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { BackLink } from '../../components/BackLink';
import MapView, { MapMarker } from '../../components/MapView';
import { LoadError, Loading, StatusBadge } from '../../components/ui';
import { dateTime } from '../../format';
import { NO_HISTORY_HELP, NO_HISTORY_TITLE, ONE_POINT_HELP, routeView } from '../../gpsHistory';
import { useLoad } from '../../hooks';
import { adminBookingPath } from '../../routes';
import type { BookingGpsHistory } from '../../types';

/**
 * Admin: the stored GPS route of ONE rental (GET /api/admin/gps/bookings/{id}/history), drawn on the map with start
 * and latest/end markers, and listed in time order. Only that booking's own reports; kept for the normal retention.
 */
export default function GpsHistory() {
  const { id = '' } = useParams();
  const history = useLoad(
    () => api.get<BookingGpsHistory>(`/admin/gps/bookings/${encodeURIComponent(id)}/history`),
    [id],
  );

  if (history.loading && !history.data) return <Loading what="Loading the GPS history" />;
  if (!history.data) {
    return (
      <div className="admin-page">
        <BackLink fallback="/admin/gps" label="Live GPS" />
        <LoadError error={`We couldn't load the GPS history. ${history.error ?? ''}`} onRetry={history.reload} />
      </div>
    );
  }
  const h = history.data;
  const first = h.points[0];
  const last = h.points[h.points.length - 1];
  const view = routeView(h.points);

  // Existing MapView marker kinds: the start in green, the latest (or final) position in blue.
  const markers: MapMarker[] = [];
  if (first) {
    markers.push({
      id: 'start',
      lat: first.latitude,
      lng: first.longitude,
      kind: 'AVAILABLE',
      popup: <span>Start · {dateTime(first.recordedAt)}</span>,
    });
  }
  if (last && last !== first) {
    markers.push({
      id: 'end',
      lat: last.latitude,
      lng: last.longitude,
      kind: 'RENTED',
      popup: (
        <span>
          {h.end ? 'End' : 'Latest'} · {dateTime(last.recordedAt)}
        </span>
      ),
    });
  }

  return (
    <div className="admin-page">
      <BackLink fallback="/admin/gps" label="Live GPS" />
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Operations · GPS history</span>
          <h1>{h.reference}</h1>
          <p className="muted">
            {h.scooterCode} · {h.scooterModel} ({h.plateNumber}) · {h.customerName} ·{' '}
            <Link to={adminBookingPath(h.bookingId)}>Open booking</Link>
          </p>
        </div>
        <StatusBadge status={h.status} />
      </div>

      <dl className="header-stats" aria-label="Route summary">
        <div className="header-stat">
          <dt>Started</dt>
          <dd className="small">{dateTime(h.start)}</dd>
        </div>
        <div className="header-stat">
          <dt>{h.end ? 'Ended' : 'Under way'}</dt>
          <dd className="small">{h.end ? dateTime(h.end) : 'Still riding'}</dd>
        </div>
        <div className="header-stat">
          <dt>GPS reports</dt>
          <dd>{h.points.length}</dd>
        </div>
        <div className="header-stat">
          <dt>Route distance</dt>
          <dd>{h.distanceKm} km</dd>
        </div>
      </dl>

      {h.points.length === 0 || !view ? (
        <div className="empty-state" role="status">
          <h2 className="section-title">{NO_HISTORY_TITLE}</h2>
          <p className="muted">{NO_HISTORY_HELP}</p>
        </div>
      ) : (
        <>
          <MapView
            key={`${h.points.length}-${view.zoom}`}
            markers={markers}
            trail={h.points.length > 1 ? h.points.map((p) => [p.latitude, p.longitude] as [number, number]) : undefined}
            center={view.center}
            zoom={view.zoom}
          />
          {h.points.length === 1 ? (
            <p className="muted small">
              {ONE_POINT_HELP} The marker shows the report at {dateTime(first.recordedAt)}.
            </p>
          ) : (
            <p className="muted small">
              Green: first report. Blue: {h.end ? 'last report' : 'latest report'}. Line: the route in time order.
            </p>
          )}
          <div className="table-wrap">
            <table className="admin-table">
              <caption className="sr-only">GPS reports for {h.reference}, oldest first</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Time</th>
                  <th scope="col">Latitude</th>
                  <th scope="col">Longitude</th>
                  <th scope="col" className="num">
                    Speed
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.points.map((p, i) => (
                  <tr key={`${p.recordedAt}-${i}`}>
                    <td data-label="#">{i + 1}</td>
                    <td data-label="Time">{dateTime(p.recordedAt)}</td>
                    <td data-label="Latitude">{p.latitude.toFixed(6)}</td>
                    <td data-label="Longitude">{p.longitude.toFixed(6)}</td>
                    <td data-label="Speed" className="num">
                      {p.speedKmh != null ? `${Math.round(p.speedKmh)} km/h` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
