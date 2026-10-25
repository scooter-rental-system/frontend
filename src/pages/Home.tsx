import { useEffect, useId, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ScooterCard } from '../components/ScooterCard';
import { ErrorAlert, LoadError, ScooterIllustration } from '../components/ui';
import { Discovery, discover, discoveryParams, isFiltered, NO_FILTERS, parseDiscovery, resultSummary, SORT_OPTIONS, SortKey } from '../discovery';
import { humanize, money } from '../format';
import { useLoad } from '../hooks';
import type { GearItem, Scooter } from '../types';

/** The steps of the real booking flow (ScooterBook → Checkout → BookingDetail). */
const HOW_IT_WORKS = [
  {
    title: 'Choose & reserve',
    text: 'Pick a scooter, a start time and a pick-up point in Kandy, and add any gear you need.',
  },
  {
    title: 'Sign the agreement',
    text: 'Read the rental agreement and sign it online before you pay.',
  },
  {
    title: 'Pay securely',
    text: 'Pay the first hour, plus one day of any gear, by card through Stripe. Unpaid reservations are released after 30 minutes.',
  },
  {
    title: 'Ride, then end the rental',
    text: 'There is no fixed return time: end the rental in the app. The hours and kilometres you rode are charged to the same card.',
  },
];

export default function Home() {
  const [params, setParams] = useSearchParams();
  const discovery = parseDiscovery(params);
  const searchRef = useRef<HTMLInputElement>(null);
  const ids = { search: useId(), sort: useId(), gear: useId() };

  const { hash } = useLocation();

  const scooters = useLoad(() => api.get<Scooter[]>('/scooters'), []);
  const gear = useLoad(() => api.get<GearItem[]>('/gear'), []);

  // Links such as "/#fleet" (ScooterBook's "All scooters") open at that section.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  const all = scooters.data ?? [];
  const shown = discover(all, discovery);

  const update = (next: Partial<Discovery>) =>
    setParams(discoveryParams({ ...discovery, ...next }), { replace: true });
  const clearFilters = () => setParams(discoveryParams({ ...NO_FILTERS, sort: discovery.sort }), { replace: true });

  const findScooter = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('fleet')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    searchRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="home">
      <section className="hero home-hero" aria-labelledby="home-title">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">Scooter rental in Kandy, Sri Lanka</p>
          <h1 id="home-title">Explore Kandy and the hill country on two wheels</h1>
          <p>
            Book a scooter online, sign the rental agreement digitally and pay securely by card. You pay by the hour and
            kilometre, and you can add camping gear for trips beyond the city.
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={findScooter}>
              Find a scooter
            </button>
            <a className="btn on-ink" href="#how-it-works">
              How it works
            </a>
          </div>
          <ul className="home-hero__facts">
            <li>Card payments by Stripe</li>
            <li>GPS-tracked rentals</li>
            <li>Pick-up in Kandy town</li>
          </ul>
        </div>
        <div className="home-hero__art" aria-hidden>
          <ScooterIllustration />
        </div>
      </section>

      <section className="stack" id="fleet" aria-labelledby="fleet-title">
        <div className="section-heading">
          <h2 id="fleet-title" className="home-section-title">
            Our fleet
          </h2>
          {scooters.data && (
            <p className="muted small" role="status" aria-atomic="true">
              {resultSummary(shown.length, all.length)}
            </p>
          )}
        </div>

        <form className="discovery" role="search" aria-label="Find a scooter" onSubmit={(e) => e.preventDefault()}>
          <label className="discovery__search" htmlFor={ids.search}>
            Search
            <input
              ref={searchRef}
              id={ids.search}
              type="search"
              placeholder="Model or code, e.g. Dio"
              value={discovery.q}
              onChange={(e) => update({ q: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="discovery__sort" htmlFor={ids.sort}>
            Sort by
            <select id={ids.sort} value={discovery.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline discovery__toggle">
            <input type="checkbox" checked={discovery.available} onChange={(e) => update({ available: e.target.checked })} />
            Available now only
          </label>
          {isFiltered(discovery) && (
            <button type="button" className="ghost small" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </form>

        {scooters.error && (
          <LoadError error={`We couldn't load the scooters. ${scooters.error}`} onRetry={scooters.reload} />
        )}

        {scooters.loading && !scooters.data && (
          <p className="muted" role="status">
            Loading scooters…
          </p>
        )}

        {scooters.data && all.length > 0 && shown.length === 0 && <p className="muted">No scooters match your filters.</p>}

        {shown.length > 0 && (
          <div className="grid">
            {shown.map((s) => (
              <ScooterCard key={s.id} scooter={s} onShowAvailable={discovery.available ? undefined : () => update({ available: true })} />
            ))}
          </div>
        )}
      </section>

      <section className="stack" id="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title" className="home-section-title">
          How it works
        </h2>
        <ol className="how-steps">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.title} className="how-step">
              <h3>{step.title}</h3>
              <p className="muted small">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {(gear.error || (gear.data && gear.data.length > 0)) && (
        <section className="stack" aria-labelledby={ids.gear}>
          <div>
            <h2 id={ids.gear} className="home-section-title">
              Camping &amp; travel gear
            </h2>
            <p className="muted">Add gear when you book a scooter. Gear is charged per day.</p>
          </div>
          <ErrorAlert error={gear.error ? `We couldn't load the gear list. ${gear.error}` : null} />
          {gear.data && (
            <ul className="gear-grid">
              {gear.data.map((g) => (
                <li key={g.id} className="gear-card">
                  <div className="row between">
                    <h3>{g.name}</h3>
                    <span className="badge">{humanize(g.category)}</span>
                  </div>
                  {g.description && <p className="muted small">{g.description}</p>}
                  <p className="gear-card__price">
                    <strong className="num">{money(g.dailyRate)}</strong>
                    <span className="muted small"> / day</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
