import type { ComponentProps, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from '../lib/cx';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cx('size-5 animate-spin text-ink-3', className)} />;
}

export function FullPageSpinner({ label = 'A carregar…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex items-center gap-3 text-sm text-ink-3">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

/** Caixa branca com borda e sombra suave: a base de quase tudo. */
export function Card({ className, ...rest }: ComponentProps<'section'>) {
  return <section className={cx('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid size-11 place-items-center rounded-full bg-surface-3 text-ink-3 [&>svg]:size-5">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="max-w-sm text-[13px] text-ink-3">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Mensagem de erro de um formulário. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
      {children}
    </p>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-3 px-1 font-sans text-[11px] text-ink-2">{children}</kbd>;
}

/** Barra de progresso fina. */
export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx('h-1.5 overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div style={{ width: `${pct}%` }} className="h-full rounded-full bg-live transition-[width] duration-500" />
    </div>
  );
}
