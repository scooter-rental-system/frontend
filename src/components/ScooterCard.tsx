import { useId } from 'react';
import { Link } from 'react-router-dom';
import { availabilityOf } from '../discovery';
import { money } from '../format';
import { INCLUDED_KM_PER_DAY } from '../pricing';
import { scooterPath } from '../routes';
import type { Scooter } from '../types';
import { ScooterThumb } from './ui';

/**
 * A scooter in the fleet grid: photo (or the placeholder), model, engine size, availability, description and the
 * backend's rates. Only a bookable scooter links to booking; otherwise the card offers the "available now" list.
 */
export function ScooterCard({ scooter: s, onShowAvailable }: { scooter: Scooter; onShowAvailable?: () => void }) {
  const titleId = useId();
  const availability = availabilityOf(s);

  return (
    <article className={`card scooter-card${availability.bookable ? '' : ' is-unavailable'}`} aria-labelledby={titleId}>
      {/* Figma Browse & Search v3: the photo with the availability pill over it. */}
      <div className="scooter-card__media">
        <ScooterThumb imageUrl={s.imageUrl} alt={s.model} />
        <span className={`badge ${availability.tone}`}>{availability.label}</span>
      </div>

      <div className="scooter-card__head">
        <div>
          <h3 id={titleId}>{s.model}</h3>
          <p className="muted small">
            {s.engineCc ? `${s.engineCc} cc · ` : ''}
            {s.code}
          </p>
        </div>
      </div>

      {s.description && <p className="scooter-card__desc small">{s.description}</p>}

      <div className="scooter-card__foot">
        <p className="scooter-price">
          <span className="price">{money(s.dailyRate)}</span>
          <span className="muted small"> / day</span>
          <span className="scooter-price__extra muted small">
            {money(s.hourlyRate)} / extra hour · {INCLUDED_KM_PER_DAY} km/day included, then {money(s.perKmRate)} / km
          </span>
        </p>
        {availability.bookable ? (
          <Link className="btn primary" to={scooterPath(s.id)}>
            Book<span className="sr-only"> {s.model}</span>
          </Link>
        ) : (
          onShowAvailable && (
            <button type="button" className="small" onClick={onShowAvailable}>
              See available scooters
            </button>
          )
        )}
      </div>
    </article>
  );
}

/** Placeholder cards while the fleet loads (hidden from screen readers; the page announces the loading). */
export function ScooterCardSkeleton() {
  return (
    <div className="card scooter-card scooter-card--skeleton" aria-hidden>
      <div className="scooter-thumb skeleton" />
      <div className="skeleton skeleton--line" style={{ width: '60%' }} />
      <div className="skeleton skeleton--line" style={{ width: '35%' }} />
      <div className="skeleton skeleton--line" style={{ width: '90%' }} />
      <div className="scooter-card__foot">
        <div className="skeleton skeleton--line" style={{ width: '40%' }} />
        <div className="skeleton skeleton--button" />
      </div>
    </div>
  );
}
