import type { FormEvent, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/cx';
import { Button, IconButton } from './Button';

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  size?: keyof typeof SIZES;
  /** Janela que não se pode fechar (por exemplo, a escolha obrigatória de palavra-passe). */
  locked?: boolean;
  /** Se existir, o corpo e o rodapé formam um formulário e este é o que acontece ao submeter. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * Janela de diálogo. Usa o <dialog> do próprio browser, que já trata do foco, da
 * tecla Esc e de bloquear o resto da página. Para a mostrar, basta pô-la na árvore:
 * {open && <Modal ...>}. Ao sair da árvore, fecha.
 */
export function Modal({ title, subtitle, onClose, size = 'md', locked, onSubmit, footer, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    // Foco inicial: o primeiro campo, não o botão de fechar.
    const target = dlg.querySelector<HTMLElement>('[data-autofocus]') ?? dlg.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select');
    (target ?? dlg).focus({ preventScroll: true });
    return () => { if (dlg.open) dlg.close(); };
  }, []);

  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-3 sm:px-6">{footer}</div>}
    </>
  );

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); if (!locked) onClose(); }}
      onPointerDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOnBackdrop.current && !locked) onClose(); }}
      className={cx(
        'm-auto max-h-[92dvh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-modal open:flex',
        SIZES[size],
      )}
    >
      <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
        {!locked && (
          <IconButton label="Fechar" size="sm" onClick={onClose} className="-mt-0.5 -mr-1.5">
            <X className="size-4" />
          </IconButton>
        )}
      </header>
      {onSubmit ? (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">{body}</form>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      )}
    </dialog>
  );
}

// ---------- confirmações ----------

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  /** "danger" pinta o botão de vermelho (apagar, remover…). */
  tone?: 'danger' | 'normal';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

/** Uso: const confirm = useConfirm(); if (await confirm({ title: 'Apagar?' })) { … } */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback<Confirm>((options) => new Promise((resolve) => setPending({ options, resolve })), []);

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      {pending && (
        <Modal
          size="sm"
          title={pending.options.title}
          onClose={() => answer(false)}
          footer={
            <>
              <span className="flex-1" />
              <Button onClick={() => answer(false)}>Cancelar</Button>
              <Button
                variant={pending.options.tone === 'danger' ? 'destructive' : 'primary'}
                onClick={() => answer(true)}
                data-autofocus
              >
                {pending.options.confirmLabel ?? 'Confirmar'}
              </Button>
            </>
          }
        >
          {pending.options.message && <p className="text-sm leading-relaxed text-ink-2">{pending.options.message}</p>}
        </Modal>
      )}
    </ConfirmContext>
  );
}
