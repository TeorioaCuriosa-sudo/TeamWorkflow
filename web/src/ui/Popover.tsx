import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';

interface PopoverProps {
  /** Desenha o botão que abre. Recebe o estado e a função para abrir/fechar. */
  trigger: (api: { open: boolean; toggle: () => void }) => ReactNode;
  /** O conteúdo. Recebe "close" para se fechar depois de uma escolha. */
  children: (api: { close: () => void }) => ReactNode;
  /** A que lado do botão fica alinhado o painel. */
  align?: 'start' | 'end';
  /** Abre para cima (útil junto ao fundo do ecrã). */
  up?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  panelClassName?: string;
  label: string;
}

/** Painel que aparece junto a um botão. Fecha ao clicar fora ou com Esc. */
export function Popover({ trigger, children, align = 'end', up, onOpenChange, className, panelClassName, label }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const set = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) set(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') set(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, set]);

  return (
    <div ref={root} className={cx('relative', className)}>
      {trigger({ open, toggle: () => set(!open) })}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cx(
            'absolute z-40 min-w-56 animate-[slide-up_140ms_ease-out] rounded-xl border border-line bg-surface text-ink shadow-pop',
            up ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children({ close: () => set(false) })}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, tone, href }: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  tone?: 'danger';
  href?: string;
}) {
  const cls = cx(
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-3',
    tone === 'danger' ? 'text-danger' : 'text-ink',
  );
  const inner = (
    <>
      {icon && <span className="grid size-4 place-items-center text-ink-3 [&>svg]:size-4">{icon}</span>}
      {children}
    </>
  );
  return href ? (
    <a role="menuitem" href={href} onClick={onClick} className={cls}>{inner}</a>
  ) : (
    <button role="menuitem" type="button" onClick={onClick} className={cls}>{inner}</button>
  );
}
