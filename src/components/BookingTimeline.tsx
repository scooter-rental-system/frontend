import { timeline } from '../rental';
import type { BookingStage } from '../types';

/**
 * Reserved → Paid → In progress → Completed, from the booking's server stage. Each step's state is written out
 * for screen readers; the step under way is aria-current="step".
 */
export function BookingTimeline({ stage }: { stage: BookingStage }) {
  const SR: Record<string, string> = { done: 'done', current: 'in progress', upcoming: 'not yet', stopped: 'stopped' };
  return (
    <ol className="timeline" aria-label="Booking timeline">
      {timeline(stage).map((step) => (
        <li key={step.label} className={`timeline__step is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="timeline__dot" aria-hidden>
            {step.state === 'done' ? '✓' : step.state === 'stopped' ? '✕' : ''}
          </span>
          <span className="timeline__label">
            {step.label}
            <span className="sr-only"> ({SR[step.state]})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
