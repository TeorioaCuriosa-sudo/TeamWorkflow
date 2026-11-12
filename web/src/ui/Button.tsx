import type { ComponentProps, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from '../lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink shadow-sm hover:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  // "danger" é discreto (apagar, remover); "destructive" é o botão final de uma confirmação.
  danger: 'border border-line-strong bg-surface text-danger hover:border-danger/40 hover:bg-danger-soft',
  destructive: 'bg-danger text-white shadow-sm hover:brightness-110 dark:text-[#2a0d0a]',
  // Ações positivas (aprovar): verde, para não se confundir com o dourado da marca.
  success: 'bg-success text-white shadow-sm hover:brightness-110 dark:text-[#04210f]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-[13px]',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-sm',
  lg: 'h-11 gap-2 rounded-xl px-5 text-[15px]',
};

function buttonClass(variant: Variant, size: Size, className?: string) {
  return cx(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Uma ligação (<a>) com o aspeto de um botão: para navegar ou descarregar ficheiros. */
export function LinkButton({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: Omit<ComponentProps<'a'>, 'children'> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </a>
  );
}

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label'> {
  label: string;
  variant?: 'ghost' | 'secondary';
  size?: 'sm' | 'md';
}

/** Botão só com ícone. O texto do "label" é lido por leitores de ecrã e aparece ao pairar. */
export function IconButton({ label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'size-7' : 'size-9',
        variant === 'ghost' ? 'text-ink-3 hover:bg-surface-3 hover:text-ink' : 'border border-line-strong bg-surface text-ink-2 shadow-sm hover:bg-surface-3 hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
