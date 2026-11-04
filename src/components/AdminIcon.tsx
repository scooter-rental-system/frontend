import type { AdminIconName } from '../admin';

/** 24px line icons for the admin console, drawn in the current text colour. Decorative: always aria-hidden. */
const PATHS: Record<AdminIconName, string[]> = {
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  reports: ['M4 19h16', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  bookings: ['M5 6h14v14H5z', 'M5 10h14', 'M9 4v4', 'M15 4v4', 'M9 14h6'],
  scooter: ['M6 18a2 2 0 1 0 0-.01', 'M18 18a2 2 0 1 0 0-.01', 'M8 18h8l2-11h2', 'M6 16c0-3 2-5 5-5h2'],
  gear: ['M3 20 12 5l9 15z', 'M12 13l-3 7', 'M12 13l3 7'],
  gps: ['M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  maintenance: ['M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5', 'M14.5 6.5 17 4l3 3-2.5 2.5'],
  customers: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6', 'M16 4.5a3.5 3.5 0 0 1 0 6.5', 'M18 14c1.8.8 3 2.7 3 6'],
  billing: ['M3 6h18v12H3z', 'M3 10h18', 'M7 15h4'],
  notifications: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['M15 6l-6 6 6 6'],
  profile: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'],
};

export function AdminIcon({ name }: { name: AdminIconName }) {
  return (
    <svg className="admin-icon" viewBox="0 0 24 24" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
