import { useId } from 'react';
import { Link } from 'react-router-dom';
import { availabilityOf } from '../discovery';
import { money } from '../format';
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
      <ScooterThumb imageUrl={s.imageUrl} alt={s.model} />

      <div className="scooter-card__head">
        <div>
          <h3 id={titleId}>{s.model}</h3>
          <p className="muted small">
            {s.engineCc ? `${s.engineCc} cc · ` : ''}
            {s.code}
          </p>
        </div>
        <span className={`badge ${availability.tone}`}>{availability.label}</span>
      </div>

      {s.description && <p className="scooter-card__desc small">{s.description}</p>}

      <div className="scooter-card__foot">
        <p className="scooter-price">
          <span className="price">{money(s.hourlyRate)}</span>
          <span className="muted small"> / hour</span>
          <span className="scooter-price__extra muted small">+ {money(s.perKmRate)} / km</span>
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
