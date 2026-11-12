import { Check } from 'lucide-react';
import { cx } from '../lib/cx';
import { inkOn } from '../lib/text';

/** Escolha de uma cor entre as da paleta (bolinhas). */
export function ColorPicker({ value, options, onChange, label, size = 'md' }: {
  value: string;
  options: string[];
  onChange: (color: string) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={`Cor ${c}`}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c, color: inkOn(c) }}
          className={cx(
            'grid place-items-center rounded-full transition-transform hover:scale-110',
            size === 'sm' ? 'size-5' : 'size-7',
            c === value && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
          )}
        >
          {c === value && <Check className={size === 'sm' ? 'size-3' : 'size-4'} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
