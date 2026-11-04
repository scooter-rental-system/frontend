import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BookingStepper } from '../components/BookingStepper';
import { QuantityStepper } from '../components/QuantityStepper';
import { ErrorAlert, Loading, ScooterThumb } from '../components/ui';
import { quoteLines } from '../checkout';
import { availabilityOf } from '../discovery';
import { dateTimeInput, money, nextQuarterHour } from '../format';
import { PricingInfo } from '../components/PricingInfo';
import { GEAR_PRICING_RULE, INCLUDED_KM_PER_DAY, SCOOTER_PRICING_RULE } from '../pricing';
import { useAction, useLoad } from '../hooks';
import type { Booking, GearItem, Quote, Scooter } from '../types';

export default function ScooterBook() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Rentals are open-ended (SDS 4.2): choose when it starts; it ends when you end it.
  const [start, setStart] = useState(params.get('start') ?? nextQuarterHour());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pickup, setPickup] = useState('Kandy office, Dalada Veediya');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const create = useAction();

  const scooter = useLoad(() => api.get<Scooter>(`/scooters/${encodeURIComponent(id)}`), [id]);
  const gear = useLoad(() => api.get<GearItem[]>('/gear'), []);
  const startValid = start >= dateTimeInput(new Date(Date.now() - 60_000));

  const selection = useMemo(
    () => Object.entries(qty).filter(([, q]) => q > 0).map(([gid, q]) => ({ gearItemId: gid, quantity: q })),
    [qty],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .post<Quote>('/bookings/quote', { scooterId: id, gear: selection })
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setQuoteError(null);
        }
      })
      .catch((e) => !cancelled && setQuoteError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, selection]);

  const submit = async () => {
    if (!user) {
      navigate('/login', { state: { from: `/scooters/${id}?start=${encodeURIComponent(start)}` } });
      return;
    }
    const booking = await create.run(() =>
      api.post<Booking>('/bookings', {
        scooterId: id,
        startTime: start,
        gear: selection,
        pickupLocation: pickup,
        notes,
      }),
    );
    if (booking) navigate(`/bookings/${booking.id}/checkout`);
  };

  if (scooter.loading) return <Loading />;
  if (!scooter.data) return <ErrorAlert error={scooter.error ?? 'Scooter not found'} />;
  const s = scooter.data;
  const availability = availabilityOf(s);
  const summary = quote ? quoteLines(quote) : null;
  const canReserve = !!quote && startValid && s.available && !create.busy;

  const toSummary = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('booking-summary')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('booking-summary-title')?.focus({ preventScroll: true });
  };

  return (
    <div className="booking-page">
      <Link to="/#fleet" className="back-link">
        <span aria-hidden>←</span> All scooters
      </Link>
      <BookingStepper current={0} />

      <div className="booking-layout">
        <div className="booking-main">
          <section className="card booking-scooter" aria-labelledby="booking-scooter-title">
            <ScooterThumb imageUrl={s.imageUrl} alt={s.model} />
            <div className="booking-scooter__body">
              <div className="scooter-card__head">
                <div>
                  <h1 id="booking-scooter-title">{s.model}</h1>
                  <p className="muted small">
                    {s.engineCc ? `${s.engineCc} cc · ` : ''}
                    {s.code} · {s.plateNumber}
                  </p>
                </div>
                <span className={`badge ${availability.tone}`}>{availability.label}</span>
              </div>
              {s.description && <p className="small">{s.description}</p>}
              <p className="scooter-price">
                <span className="price">{money(s.dailyRate)}</span>
                <span className="muted small"> / day</span>
                <span className="scooter-price__extra muted small">
                  {money(s.hourlyRate)} / extra hour · {INCLUDED_KM_PER_DAY} km/day included, then{' '}
                  {money(s.perKmRate)} / km (from GPS)
                </span>
              </p>
              <p className="muted small">{SCOOTER_PRICING_RULE}</p>
            </div>
          </section>
          {!s.available && (
            <div className="alert" role="alert">
              This scooter is not available right now. <Link to="/?available=1#fleet">See available scooters</Link>
            </div>
          )}

          <fieldset className="card booking-fieldset">
            <legend>When &amp; where</legend>
            <div className="stack">
              <label>
                Start of rental
                <input
                  type="datetime-local"
                  min={dateTimeInput(new Date())}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  aria-invalid={!startValid}
                  aria-describedby="start-hint"
                />
              </label>
              <p id="start-hint" className={startValid ? 'muted small' : 'field-error'}>
                {startValid
                  ? 'No return date needed: the rental runs until you end it in the app.'
                  : 'Choose a start time from now onwards.'}
              </p>
              <label>
                Pick-up location
                <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
                  <option>Kandy office, Dalada Veediya</option>
                  <option>Kandy Railway Station</option>
                  <option>Hotel delivery in Kandy city (arrange by phone)</option>
                </select>
              </label>
              <label>
                Notes for us (optional)
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Arrival time, questions…" />
              </label>
            </div>
          </fieldset>

          <fieldset className="card booking-fieldset">
            <legend>Camping &amp; travel gear</legend>
            <div className="stack">
              <p className="muted small">Optional. {GEAR_PRICING_RULE}</p>
              <ErrorAlert error={gear.error ? `We couldn't load the gear list. ${gear.error}` : null} />
              {gear.data?.length === 0 && <p className="muted small">No gear is offered at the moment.</p>}
              {gear.data && gear.data.length > 0 && (
                <ul className="gear-picker">
                  {gear.data.map((g) => {
                    const max = g.available ?? g.totalQuantity;
                    return (
                      <li key={g.id} className="gear-picker__item">
                        <div>
                          <div className="gear-picker__name">{g.name}</div>
                          <div className="muted small">
                            {money(g.dailyRate)} / day · {max > 0 ? `${max} available` : 'None available'}
                          </div>
                        </div>
                        <QuantityStepper
                          name={g.name}
                          value={qty[g.id] ?? 0}
                          max={max}
                          onChange={(n) => setQty({ ...qty, [g.id]: n })}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </fieldset>

          <div className="card">
            <PricingInfo rates={s} />
          </div>

          {/* Small screens: the amount and a shortcut to the summary stay in reach while filling in the form. */}
          <div className="booking-mobilebar">
            <div>
              <div className="muted small">Pay now</div>
              <strong className="num">{summary ? money(summary.payNow) : '—'}</strong>
            </div>
            <button type="button" className="primary" onClick={toSummary}>
              Review &amp; reserve
            </button>
          </div>
        </div>

        <aside className="card booking-summary" id="booking-summary" aria-labelledby="booking-summary-title">
          <h2 id="booking-summary-title" tabIndex={-1}>
            Booking summary
          </h2>
          <ErrorAlert error={quoteError} />
          {!quote && !quoteError && <p className="muted small">Calculating your price…</p>}
          {summary && (
            <dl className="summary-lines" aria-live="polite">
              {summary.lines.map((line) => (
                <div key={line.label} className="summary-line">
                  <dt>
                    {line.label}
                    {line.detail && <span className="muted small"> · {line.detail}</span>}
                  </dt>
                  <dd className="num">{money(line.amount)}</dd>
                </div>
              ))}
              <div className="summary-line summary-line--total">
                <dt>Pay now</dt>
                <dd className="num">{money(summary.payNow)}</dd>
              </div>
            </dl>
          )}
          <details className="summary-explain">
            <summary>How the final total is calculated</summary>
            <p className="muted small">
              Today you pay the one-hour minimum and one day of any gear. When you end the rental: full days × daily
              rate, plus extra hours × extra-hour rate (more than 8 extra hours counts as another day), plus the km
              above the allowance ({INCLUDED_KM_PER_DAY} km per charged day, at least {INCLUDED_KM_PER_DAY} km) × per-km
              rate, plus gear per day (more than 12 extra hours counts as another day). The balance after today's
              payment is charged to the same card, or any excess is refunded.
            </p>
          </details>
          <ErrorAlert error={create.error} />
          <button className="primary booking-summary__cta" disabled={!canReserve} onClick={submit}>
            {user ? (create.busy ? 'Reserving…' : 'Reserve & continue') : 'Log in to book'}
          </button>
          <p className="muted small">
            Next: review and sign the rental agreement, then pay. Unpaid reservations are released after 30 minutes.
          </p>
        </aside>
      </div>
    </div>
  );
}
