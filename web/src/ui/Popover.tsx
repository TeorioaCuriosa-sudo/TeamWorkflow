import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /**
   * Para botões dentro de caixas que cortam o que sai delas (os cartões com cantos redondos): o painel
   * fica por cima de tudo, abre para o lado do botão onde há mais espaço e fecha se a página mexer.
   */
  floating?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  panelClassName?: string;
  label: string;
}

/** Painel que aparece junto a um botão. Fecha ao clicar fora ou com Esc. */
export function Popover({ trigger, children, align = 'end', up, floating, onOpenChange, className, panelClassName, label }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ top: number; left: number } | null>(null);

  const set = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  // Modo flutuante: mede o botão ao abrir e escolhe o lado com mais espaço.
  useLayoutEffect(() => {
    if (!open || !floating || !root.current) { setPlace(null); return; }
    const r = root.current.getBoundingClientRect();
    anchor.current = { top: r.top, left: r.left };
    const margin = 12;
    const above = r.top - 64; // 64 = a barra de cima
    const below = window.innerHeight - r.bottom - margin;
    const goUp = above > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 264));
    setPlace({
      position: 'fixed',
      left: align === 'start' ? left : undefined,
      right: align === 'end' ? Math.max(8, window.innerWidth - r.right) : undefined,
      top: goUp ? undefined : r.bottom + 8,
      bottom: goUp ? window.innerHeight - r.top + 8 : undefined,
      maxHeight: Math.max(160, (goUp ? above : below) - 8),
    });
  }, [open, floating, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) set(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') set(false); };
    // Se a página se mexe, o painel solto ficaria longe do botão: fecha. (O scroll chega ao browser um instante depois,
    // por isso confirma-se que o botão mudou mesmo de sítio; e o scroll dentro do próprio painel não conta.)
    const onMove = (e: Event) => {
      if (!floating || (e.target instanceof Node && panel.current?.contains(e.target))) return;
      const a = anchor.current;
      const r = root.current?.getBoundingClientRect();
      if (e.type === 'resize' || !a || !r || Math.abs(r.top - a.top) > 1 || Math.abs(r.left - a.left) > 1) set(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, floating, set]);

  return (
    <div ref={root} className={cx('relative', className)}>
      {trigger({ open, toggle: () => set(!open) })}
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          style={floating ? place ?? { visibility: 'hidden' } : undefined}
          className={cx(
            'z-40 min-w-56 animate-[slide-up_140ms_ease-out] rounded-xl border border-line bg-surface text-ink shadow-pop',
            floating ? 'fixed overflow-y-auto' : cx('absolute', up ? 'bottom-full mb-2' : 'top-full mt-2', align === 'end' ? 'right-0' : 'left-0'),
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
