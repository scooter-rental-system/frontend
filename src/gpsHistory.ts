/**
 * Helpers for the admin GPS history of one rental. Kept free of runtime imports so `npm test` can run them.
 * They only arrange the stored reports; they never add points.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export const NO_HISTORY_TITLE = 'No GPS history recorded for this rental yet.';
export const NO_HISTORY_HELP = 'Location history appears after GPS reporting starts for the active rental.';
export const ONE_POINT_HELP = 'Only one GPS report so far, so there is no route to draw yet.';

/**
 * A map centre and zoom that fit all the points (MapView takes a centre and a zoom, not bounds). One point gets a
 * close street-level zoom; a route gets the largest zoom at which its whole extent fits, with a little margin.
 */
export function routeView(points: readonly LatLng[]): { center: [number, number]; zoom: number } | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center: [number, number] = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
  if (points.length === 1) return { center, zoom: 16 };
  // At zoom z one tile-width of the map shows about 360 / 2^z degrees; keep the extent within roughly half of it.
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.0005);
  const zoom = Math.floor(Math.log2(360 / span)) - 2;
  return { center, zoom: Math.max(3, Math.min(17, zoom)) };
}
