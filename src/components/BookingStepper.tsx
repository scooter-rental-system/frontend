import { stepStates } from '../checkout';

/**
 * The booking journey's progress: Details → Agreement → Payment → Confirmed. An ordered list; the current step is
 * aria-current="step", finished steps say so in text (not only by colour).
 */
export function BookingStepper({ current }: { current: number }) {
  return (
    <ol className="booking-stepper" aria-label="Booking progress">
      {stepStates(current).map(({ label, state }, i) => (
        <li key={label} className={`booking-stepper__step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="booking-stepper__marker" aria-hidden>
            {state === 'done' ? '✓' : i + 1}
          </span>
          <span className="booking-stepper__label">
            {label}
            {state === 'done' && <span className="sr-only"> (completed)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
