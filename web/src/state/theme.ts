// Tema claro/escuro/automático. Quem decide é o public/theme.js (carrega antes de tudo
// para a página não "piscar"); aqui só lemos e mudamos.

import { useCallback, useSyncExternalStore } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';

interface TwTheme {
  get: () => string;
  set: (mode: ThemeMode) => void;
}
declare global {
  interface Window { twTheme?: TwTheme }
}

const listeners = new Set<() => void>();
const read = (): ThemeMode => {
  const m = window.twTheme?.get() ?? 'auto';
  return m === 'light' || m === 'dark' ? m : 'auto';
};

export function useTheme(): { mode: ThemeMode; setMode: (m: ThemeMode) => void; next: () => void } {
  const mode = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => 'auto' as ThemeMode,
  );
  const setMode = useCallback((m: ThemeMode) => {
    window.twTheme?.set(m);
    listeners.forEach((fn) => fn());
  }, []);
  const next = useCallback(() => setMode(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'), [mode, setMode]);
  return { mode, setMode, next };
}

export const THEME_LABEL: Record<ThemeMode, string> = { auto: 'Automático', light: 'Claro', dark: 'Escuro' };
