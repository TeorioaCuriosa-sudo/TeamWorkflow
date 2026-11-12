import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { cx } from '../lib/cx';

type Kind = 'info' | 'success' | 'error';
interface ToastItem { id: number; message: string; kind: Kind }
interface ToastApi {
  show: (message: string, kind?: Kind) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {}, error: () => {}, success: () => {} });
export const useToast = () => useContext(ToastContext);

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;
const ICON_COLOR = { info: 'text-info', success: 'text-success', error: 'text-danger' } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = next.current++;
    setItems((list) => [...list.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 5500 : 3500);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    error: (m) => show(m, 'error'),
    success: (m) => show(m, 'success'),
  }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end lg:bottom-5"
      >
        {items.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex max-w-sm animate-[slide-up_180ms_ease-out] items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink shadow-pop"
            >
              <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', ICON_COLOR[t.kind])} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}
