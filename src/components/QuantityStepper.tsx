import { clampQuantity } from '../checkout';

/** − value + for a gear quantity, kept within 0…max. The number can also be typed. */
export function QuantityStepper({
  name,
  value,
  max,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  onChange: (quantity: number) => void;
}) {
  const set = (next: number) => onChange(clampQuantity(next, max));
  return (
    <div className="qty" role="group" aria-label={`Quantity of ${name}`}>
      <button type="button" className="qty__btn" aria-label={`Remove one ${name}`} disabled={value <= 0} onClick={() => set(value - 1)}>
        −
      </button>
      <input
        type="number"
        className="qty__input"
        aria-label={`Quantity of ${name}`}
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
      <button type="button" className="qty__btn" aria-label={`Add one ${name}`} disabled={value >= max} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
}
