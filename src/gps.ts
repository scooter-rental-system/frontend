/**
 * Rider location reporting (BE-032: POST /api/bookings/{id}/location). The browser's Geolocation API is the only
 * source: nothing here generates, smooths or extrapolates a position. The backend takes the rider from the token,
 * the scooter from the booking and the time from its own clock, and derives the speed when the browser has none.
 *
 * Kept free of React and of browser globals (the geolocation object and timers are passed in), so the rules can be
 * tested on their own.
 */

/** Between reports. The backend ignores rider reports within 5 s of the previous one and calls a position stale
 *  after 2 minutes; every 10 s keeps the live view fresh and the billed route detailed without flooding it. */
export const REPORT_INTERVAL_MS = 10_000;

/** What the backend accepts (GpsDtos.LocationRequest). No user id, scooter id or timestamp. */
export interface LocationReport {
  latitude: number;
  longitude: number;
  speedKmh?: number;
  accuracyMeters?: number;
}

/** The parts of a browser GeolocationPosition used here. */
export interface PositionLike {
  coords: { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null };
}

const MAX_SPEED_KMH = 999.99;

/**
 * The report for a real browser position, or null if the browser gave no usable coordinates. Speed (m/s from the
 * browser) and accuracy are included only when the browser actually provided them; a missing speed is left for
 * the backend to derive, never made up here.
 */
export function toLocationReport(position: PositionLike): LocationReport | null {
  const { latitude, longitude, accuracy, speed } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const report: LocationReport = { latitude, longitude };
  if (typeof speed === 'number' && Number.isFinite(speed) && speed >= 0) {
    const kmh = Math.round(speed * 3.6 * 100) / 100;
    if (kmh <= MAX_SPEED_KMH) report.speedKmh = kmh;
  }
  if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0) {
    report.accuracyMeters = accuracy;
  }
  return report;
}

export type GpsStatus =
  | 'starting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'insecure'
  | 'report-failed'
  | 'stopped';

export const GPS_STATUS_TEXT: Record<GpsStatus, string> = {
  starting: 'Starting location tracking…',
  active: 'Location tracking active.',
  denied:
    'Location permission is required for live rental tracking. Allow location access for this site in your ' +
    'browser settings, then reload the page.',
  unavailable: 'Your location is currently unavailable. Tracking resumes when your device finds it.',
  timeout: 'Still waiting for your location. Tracking resumes when your device finds it.',
  unsupported: 'This browser cannot share its location, so live tracking is off.',
  insecure: 'Location tracking needs a secure (HTTPS) connection, so live tracking is off.',
  'report-failed': 'Unable to report your location right now. Retrying with your next position.',
  stopped: 'Location tracking has stopped.',
};

/** Statuses in which no location is being shared. */
export function isTrackingOff(status: GpsStatus): boolean {
  return status === 'denied' || status === 'unsupported' || status === 'insecure' || status === 'stopped';
}

/** The browser Geolocation API, as passed in (navigator.geolocation). */
export interface GeolocationLike {
  watchPosition(
    success: (position: PositionLike) => void,
    error: (error: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number },
  ): number;
  clearWatch(id: number): void;
}

export interface Timers {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const browserTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** GeolocationPositionError codes. */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

export interface TrackingOptions {
  /** navigator.geolocation, or undefined when the browser has none. */
  geolocation: GeolocationLike | undefined;
  /** window.isSecureContext: browsers only share location with HTTPS pages (and http://localhost). */
  secureContext: boolean;
  /** Posts one report; rejects with an error carrying `status` for HTTP failures. */
  send: (report: LocationReport) => Promise<unknown>;
  onStatus: (status: GpsStatus) => void;
  intervalMs?: number;
  timers?: Timers;
}

/**
 * Watches the browser position and reports it, at most once per interval; positions that arrive in between
 * replace the waiting one, so the newest real position is the one sent. Returns a function that stops the watcher
 * and any pending report. Tracking also stops by itself when the permission is denied, or when the backend says
 * the session or the rental is over (401, 404, 409).
 */
export function startRiderTracking({
  geolocation,
  secureContext,
  send,
  onStatus,
  intervalMs = REPORT_INTERVAL_MS,
  timers = browserTimers,
}: TrackingOptions): () => void {
  if (!secureContext) {
    onStatus('insecure');
    return () => {};
  }
  if (!geolocation) {
    onStatus('unsupported');
    return () => {};
  }

  let stopped = false;
  let watchId: number | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let waiting: LocationReport | null = null;
  let timer: unknown = null;
  let sending = false;

  const stop = (finalStatus?: GpsStatus) => {
    if (stopped) return;
    stopped = true;
    if (watchId !== null) geolocation.clearWatch(watchId);
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    waiting = null;
    if (finalStatus) onStatus(finalStatus);
  };

  const flush = async () => {
    timer = null;
    if (stopped || sending || !waiting) return;
    const report = waiting;
    waiting = null;
    sending = true;
    lastSentAt = timers.now();
    try {
      await send(report);
      if (!stopped) onStatus('active');
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (status === 401 || status === 404 || status === 409) {
        stop('stopped'); // signed out, not this rider's booking, or the rental is no longer under way
        return;
      }
      if (!stopped) onStatus('report-failed');
    } finally {
      sending = false;
    }
    schedule();
  };

  const schedule = () => {
    if (stopped || timer !== null || sending || !waiting) return;
    const wait = Math.max(0, lastSentAt + intervalMs - timers.now());
    timer = timers.setTimeout(() => void flush(), wait);
  };

  onStatus('starting');
  watchId = geolocation.watchPosition(
    (position) => {
      if (stopped) return;
      const report = toLocationReport(position);
      if (!report) return;
      waiting = report;
      schedule();
    },
    (error) => {
      if (stopped) return;
      if (error.code === PERMISSION_DENIED) {
        stop('denied'); // never ask again on our own; the rider changes it in the browser settings
      } else {
        // TIMEOUT or POSITION_UNAVAILABLE (or an unknown code): the watcher keeps trying on its own.
        onStatus(error.code === TIMEOUT ? 'timeout' : 'unavailable');
      }
    },
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
  );

  return () => stop();
}
