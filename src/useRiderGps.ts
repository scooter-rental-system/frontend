import { useEffect, useState } from 'react';
import { api } from './api';
import { startRiderTracking, type GpsStatus } from './gps';

/** One location watcher per browser tab: starting a new one stops the previous. */
let stopCurrent: (() => void) | null = null;

/**
 * Reports the browser's real location for the rider's own rental in progress (see gps.ts). Runs only while
 * `active`; stops when it turns false, the booking changes or the component unmounts (leaving the page, or
 * signing out, which leaves the customer pages). Returns the tracking status, or null when not tracking.
 */
export function useRiderGps(bookingId: string, active: boolean): GpsStatus | null {
  const [status, setStatus] = useState<GpsStatus | null>(null);

  useEffect(() => {
    if (!active) {
      setStatus(null);
      return;
    }
    stopCurrent?.();
    const stop = startRiderTracking({
      geolocation: typeof navigator === 'undefined' ? undefined : navigator.geolocation,
      secureContext: window.isSecureContext,
      send: (report) => api.post(`/bookings/${encodeURIComponent(bookingId)}/location`, report),
      onStatus: setStatus,
    });
    stopCurrent = stop;
    return () => {
      stop();
      if (stopCurrent === stop) stopCurrent = null;
    };
  }, [bookingId, active]);

  return status;
}
