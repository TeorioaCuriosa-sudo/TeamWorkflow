import type { ReactNode } from 'react';
import { Flag, Folder, Siren, X, Zap } from 'lucide-react';
import type { Urgency } from '../api/types';
import { URGENCY_LABEL } from '../lib/labels';
import { cx, vars } from '../lib/cx';

interface ChipProps {
  color: string;
  children: ReactNode;
  kind?: 'topic' | 'project';
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  title?: string;
}

/**
 * Etiqueta com a cor de um tópico (pílula com ponto) ou de um projeto (retângulo com pasta).
 * A cor vem de --c; os tons de fundo e de texto saem dela, nos dois temas.
 */
export function Chip({ color, children, kind = 'topic', onRemove, removeLabel, className, title }: ChipProps) {
  return (
    <span
      title={title}
      style={vars({ '--c': color })}
      className={cx(
        'tint tint-line inline-flex max-w-full items-center gap-1 text-[11.5px] leading-4 font-medium',
        kind === 'topic' ? 'rounded-full py-0.5 pr-2 pl-1.5' : 'rounded-md py-0.5 pr-1.5 pl-1',
        className,
      )}
    >
      {kind === 'topic' ? (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--c)]" />
      ) : (
        <Folder aria-hidden className="size-3 shrink-0" />
      )}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel ?? 'Remover'} className="-mr-0.5 grid size-3.5 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/15">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Contador pequeno (avisos por ler, pedidos pendentes…). Não aparece quando é zero. */
export function Count({ n, className, tone = 'accent' }: { n: number; className?: string; tone?: 'accent' | 'danger' | 'muted' }) {
  if (!n) return null;
  return (
    <span
      className={cx(
        'num inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] leading-none font-semibold',
        tone === 'accent' && 'bg-accent text-on-primary',
        tone === 'danger' && 'bg-danger text-white dark:text-[#2a0d0a]',
        tone === 'muted' && 'bg-surface-3 text-ink-2',
        className,
      )}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

type Tone = 'neutral' | 'info' | 'warn' | 'success' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  info: 'bg-info-soft text-info',
  warn: 'bg-warn-soft text-warn',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
};

/** Pequena etiqueta de estado ("À espera", "Aprovada", "Agora"). */
export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] leading-4 font-medium', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const URGENCY_STYLE: Record<Exclude<Urgency, 'normal'>, { cls: string; icon: ReactNode }> = {
  priority: { cls: 'bg-info-soft text-info', icon: <Flag aria-hidden className="size-3" /> },
  urgent: { cls: 'bg-warn-soft text-warn', icon: <Zap aria-hidden className="size-3" /> },
  critical: { cls: 'bg-danger text-white dark:text-[#2a0d0a]', icon: <Siren aria-hidden className="size-3" /> },
};

/** Grau de urgência de uma tarefa. Não aparece quando é "normal". */
export function UrgencyBadge({ urgency, className }: { urgency: Urgency; className?: string }) {
  if (urgency === 'normal') return null;
  const st = URGENCY_STYLE[urgency];
  return (
    <span title={`Urgência: ${URGENCY_LABEL[urgency]}`} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] leading-4 font-semibold', st.cls, className)}>
      {st.icon}
      {URGENCY_LABEL[urgency]}
    </span>
  );
}
