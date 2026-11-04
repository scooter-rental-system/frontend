import { money } from '../format';
import { INCLUDED_KM_PER_DAY } from '../pricing';

interface Rates {
  dailyRate: number;
  hourlyRate: number;
  perKmRate: number;
}

/**
 * "How pricing works": the scooter, distance and gear rules in plain words. With a scooter's rates (from the API),
 * each rule shows that scooter's amounts; without them it explains the rules only. No amounts are hard-coded.
 */
export function PricingInfo({ rates, headingLevel = 2 }: { rates?: Rates; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const Sub = headingLevel === 2 ? 'h3' : 'h4';
  return (
    <section className="pricing-info" aria-labelledby="pricing-info-title">
      <Heading id="pricing-info-title" className="pricing-info__title">
        How pricing works
      </Heading>
      <div className="pricing-info__grid">
        <div>
          <Sub>Scooter</Sub>
          <ul>
            <li>
              The daily rate covers 24 hours{rates && <> ({money(rates.dailyRate)} / day)</>}.
            </li>
            <li>
              Up to 8 extra hours are charged at the extra-hour rate
              {rates && <> ({money(rates.hourlyRate)} / extra hour)</>}.
            </li>
            <li>More than 8 extra hours is charged as another rental day.</li>
          </ul>
        </div>
        <div>
          <Sub>Distance</Sub>
          <ul>
            <li>{INCLUDED_KM_PER_DAY} km is included per charged rental day, and at least once per rental.</li>
            <li>
              Distance above the allowance is charged at the excess-km rate
              {rates && <> ({money(rates.perKmRate)} / km)</>}.
            </li>
          </ul>
        </div>
        <div>
          <Sub>Camping gear</Sub>
          <ul>
            <li>Gear is charged per day.</li>
            <li>Up to 12 extra hours are included.</li>
            <li>More than 12 extra hours is charged as another day.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
