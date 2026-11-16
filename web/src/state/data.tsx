// Os dados da equipa (quadro, pessoas, ausências…) e a sincronização em direto.
//
// Como funciona: pedimos tudo ao servidor (GET /api/state) e guardamos aqui. Sempre que
// alguém altera alguma coisa, o servidor avisa-nos por SSE e voltamos a pedir. Quando
// somos nós a alterar, usamos mutate(): faz a alteração, mostra o erro (se houver) e
// volta a pedir os dados para ficarmos em dia.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, get } from '../api/client';
import { live } from '../api/events';
import type { AppState, Capabilities, Member, Tag, Task } from '../api/types';
import { Button } from '../ui/Button';
import { FullPageSpinner } from '../ui/misc';
import { useToast } from '../ui/Toast';

interface DataApi {
  data: AppState;
  /** true = ligado em direto, false = a tentar ligar de novo, null = ainda a ligar. */
  online: boolean | null;
  /** Sobe sempre que chegam dados novos. Quem tiver dados próprios (uma tarefa aberta, o histórico) usa isto para se atualizar. */
  version: number;
  refresh: () => Promise<void>;
  /** Executa uma alteração, mostra o erro se falhar, e atualiza os dados. Devolve true se correu bem. */
  mutate: (fn: () => Promise<unknown>) => Promise<boolean>;
  /** Marca uma ação em curso (ex.: arrastar um cartão) para não atualizar a meio. */
  setBusy: (key: string, busy: boolean) => void;
  patchState: (fn: (s: AppState) => AppState) => void;
  patchTask: (id: number, patch: Partial<Task>) => void;
}

const DataContext = createContext<DataApi | null>(null);

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
}

export function DataProvider({ month, children }: { month: string | null; children: ReactNode }) {
  const toast = useToast();
  const [data, setData] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [version, setVersion] = useState(0);

  const monthRef = useRef(month);
  const tokenRef = useRef(0);
  const dataRef = useRef<AppState | null>(null);
  const busy = useRef(new Set<string>());
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    try {
      const q = monthRef.current ? `?month=${monthRef.current}` : '';
      const next = await get<AppState>(`/api/state${q}`);
      if (token !== tokenRef.current) return; // chegou outra resposta mais recente
      dataRef.current = next;
      setData(next);
      setError(null);
      setVersion((v) => v + 1);
    } catch (e) {
      if (token !== tokenRef.current) return;
      if (dataRef.current) toast.error(errorMessage(e));
      else setError(errorMessage(e));
    }
  }, [toast]);

  // Atualização pedida por outra pessoa: espera um instante para juntar várias seguidas,
  // e adia se estivermos a meio de arrastar um cartão.
  const scheduleRefresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (busy.current.size) { pending.current = true; return; }
      pending.current = false;
      void refresh();
    }, 200);
  }, [refresh]);

  const setBusy = useCallback((key: string, on: boolean) => {
    if (on) busy.current.add(key); else busy.current.delete(key);
    if (!on && !busy.current.size && pending.current) { pending.current = false; void refresh(); }
  }, [refresh]);

  // Mudou o mês que estamos a ver (arquivo) → voltar a pedir.
  useEffect(() => {
    monthRef.current = month;
    void refresh();
  }, [month, refresh]);

  // Ligação em direto.
  useEffect(() => {
    live.connect();
    const offStatus = live.onStatus((s) => setOnline(s === 'online' ? true : s === 'offline' ? false : null));
    const offChanged = live.on('changed', scheduleRefresh);
    const offBack = live.on('reconnected', () => void refresh());
    const onVisible = () => { if (!document.hidden) scheduleRefresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offStatus(); offChanged(); offBack();
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer.current);
      live.close();
    };
  }, [refresh, scheduleRefresh]);

  const mutate = useCallback(async (fn: () => Promise<unknown>) => {
    let ok = true;
    try { await fn(); } catch (e) { ok = false; toast.error(errorMessage(e)); }
    await refresh();
    return ok;
  }, [refresh, toast]);

  const patchState = useCallback((fn: (s: AppState) => AppState) => {
    setData((s) => {
      if (!s) return s;
      const next = fn(s);
      dataRef.current = next;
      return next;
    });
  }, []);

  const patchTask = useCallback((id: number, patch: Partial<Task>) => {
    patchState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, [patchState]);

  const value = useMemo<DataApi | null>(
    () => (data ? { data, online, version, refresh, mutate, setBusy, patchState, patchTask } : null),
    [data, online, version, refresh, mutate, setBusy, patchState, patchTask],
  );

  if (!value) {
    if (error) {
      return (
        <div className="grid min-h-dvh place-items-center bg-canvas p-6">
          <div className="grid max-w-sm justify-items-center gap-3 text-center">
            <p className="text-sm text-ink">Não foi possível carregar os dados.</p>
            <p className="text-[13px] text-ink-3">{error}</p>
            <Button variant="primary" onClick={() => { setError(null); void refresh(); }}>Tentar de novo</Button>
          </div>
        </div>
      );
    }
    return <FullPageSpinner />;
  }
  return <DataContext value={value}>{children}</DataContext>;
}

// ---------- pesquisas úteis sobre os dados ----------

export interface Team {
  me: AppState['me'];
  isAdmin: boolean;
  can: Capabilities;
  /** Pessoas que ainda existem (inclui as escondidas do quadro). */
  people: Member[];
  /** Pessoas que aparecem no quadro. */
  board: Member[];
  member: (id: number | null | undefined) => Member | undefined;
  nameOf: (id: number | null | undefined) => string;
  topic: (id: number) => Tag | undefined;
  project: (id: number | null | undefined) => Tag | undefined;
}

export function useTeam(): Team {
  const { data } = useData();
  return useMemo(() => {
    const members = new Map(data.members.map((m) => [m.id, m]));
    const topics = new Map(data.topics.map((t) => [t.id, t]));
    const projects = new Map(data.projects.map((p) => [p.id, p]));
    return {
      me: data.me,
      isAdmin: data.me.role === 'admin',
      can: data.me.can,
      people: data.members.filter((m) => !m.removed),
      board: data.members.filter((m) => m.active && !m.removed),
      member: (id) => (id == null ? undefined : members.get(id)),
      nameOf: (id) => (id == null ? 'Alguém' : members.get(id)?.name ?? 'Alguém'),
      topic: (id) => topics.get(id),
      project: (id) => (id == null ? undefined : projects.get(id)),
    };
  }, [data]);
}
