import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../lib/cx';

const CONTROL =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink shadow-[0_1px_0_rgb(16_24_40/3%)] transition-colors ' +
  'hover:border-ink-3/60 focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-3 ' +
  'aria-[invalid=true]:border-danger';

/** Um campo com legenda por cima. Passa o controlo (Input, Select…) como filho. */
export function Field({ label, hint, className, children }: { label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cx('grid content-start gap-1.5', className)}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/** Para legendas de grupos de controlos (que não são um único campo). */
export function FieldGroup({ label, hint, className, children }: { label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={cx('grid content-start gap-1.5', className)}>
      <span id={id} className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(CONTROL, 'h-9', className)} {...rest} />;
}

export function Textarea({ className, rows = 3, ...rest }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cx(CONTROL, 'resize-y py-2 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select className={cx(CONTROL, 'h-9 appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </span>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Interruptor ligado/desligado. */
export function Switch({ checked, onChange, label, hint, disabled, className }: SwitchProps) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors',
          'after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[""]',
          'peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
        )}
      />
      <span className="grid gap-0.5">
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** Escolha entre poucas opções lado a lado (por exemplo, o tema). */
export function Segmented<T extends string>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-lg bg-surface-3 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Campo de texto que só grava quando se sai dele (ou se carrega em Enter) e só se mudou.
 * Serve para as definições, onde cada campo guarda sozinho.
 */
export function CommitInput({ value, onCommit, className, ...rest }: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      className={cx(CONTROL, 'h-9', className)}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      {...rest}
    />
  );
}
