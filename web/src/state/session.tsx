// Quem somos: sessão iniciada ou não, login, saída e a obrigação de mudar a palavra-passe temporária.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setApiHandlers } from '../api/client';
import { live } from '../api/events';
import type { Me } from '../api/types';
import { useToast } from '../ui/Toast';

type SessionState =
  | { status: 'loading' }
  | { status: 'out' }
  | { status: 'in'; me: Me; mustChange: boolean };

interface SessionApi {
  session: SessionState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Chamado depois de mudar a palavra-passe com sucesso. */
  passwordChanged: () => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fora do SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const toast = useToast();

  useEffect(() => {
    setApiHandlers({
      sessionLost: () => {
        setSession((s) => {
          if (s.status === 'in') toast.show('A tua sessão terminou. Entra novamente.');
          return s.status === 'out' ? s : { status: 'out' };
        });
        live.close();
      },
      mustChangePassword: () => setSession((s) => (s.status === 'in' ? { ...s, mustChange: true } : s)),
    });
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'same-origin' });
        const data = (await res.json()) as { authenticated: boolean; me: Me | null };
        if (cancelled) return;
        setSession(data.authenticated && data.me ? { status: 'in', me: data.me, mustChange: data.me.must_change_password } : { status: 'out' });
      } catch {
        if (!cancelled) setSession({ status: 'out' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Se a ligação em direto cair, confirma se a sessão ainda é válida (pode ter sido terminada noutro sítio).
  useEffect(() => {
    if (session.status !== 'in') return;
    let timer: ReturnType<typeof setTimeout>;
    const off = live.on('dropped', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const res = await fetch('/api/session', { credentials: 'same-origin' });
          const data = (await res.json()) as { authenticated: boolean };
          if (!data.authenticated) setSession({ status: 'out' });
        } catch { /* sem rede: o browser volta a ligar sozinho */ }
      }, 3000);
    });
    return () => { off(); clearTimeout(timer); };
  }, [session.status]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ me: Me }>('POST', '/api/login', { email, password });
    setSession({ status: 'in', me: res.me, mustChange: res.me.must_change_password });
  }, []);

  const logout = useCallback(async () => {
    try { await api('POST', '/api/logout', {}); } catch { /* já estava terminada */ }
    live.close();
    setSession({ status: 'out' });
  }, []);

  const passwordChanged = useCallback(() => {
    setSession((s) => (s.status === 'in' ? { ...s, mustChange: false } : s));
  }, []);

  const value = useMemo(() => ({ session, login, logout, passwordChanged }), [session, login, logout, passwordChanged]);
  return <SessionContext value={value}>{children}</SessionContext>;
}
