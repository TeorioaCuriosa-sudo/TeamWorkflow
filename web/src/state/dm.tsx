// As mensagens privadas. Como o chat da equipa, vive acima das páginas: continua a receber mensagens
// (e a contar as por ler) mesmo quando não estamos a olhar para a conversa.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { del, errorMessage, get, post } from '../api/client';
import { live } from '../api/events';
import type { ChatMessage } from '../api/types';
import { withMessage, withoutUnread } from '../lib/dm';
import { useToast } from '../ui/Toast';
import { useData } from './data';

export interface Thread {
  messages: ChatMessage[];
  loaded: boolean;
  hasMore: boolean;
}

const EMPTY: Thread = { messages: [], loaded: false, hasMore: false };

interface DmApi {
  thread: (peer: number) => Thread;
  ensureLoaded: (peer: number) => Promise<void>;
  loadOlder: (peer: number) => Promise<void>;
  send: (peer: number, text: string) => Promise<boolean>;
  remove: (peer: number, id: number) => Promise<void>;
  /** A conversa à vista (ou null): as mensagens novas dela contam como lidas. */
  setViewing: (peer: number | null) => void;
  markRead: (peer: number) => void;
}

const DmContext = createContext<DmApi | null>(null);

export function useDm(): DmApi {
  const ctx = useContext(DmContext);
  if (!ctx) throw new Error('useDm fora do DmProvider');
  return ctx;
}

type Page = { messages: ChatMessage[]; has_more: boolean };

export function DmProvider({ children }: { children: ReactNode }) {
  const { data, patchState, refresh } = useData();
  const toast = useToast();
  const meId = data.me.id;
  const [threads, setThreads] = useState<Record<number, Thread>>({});
  // A "verdade" vive numa ref (decisões imediatas); o estado serve para desenhar.
  const ref = useRef<Record<number, Thread>>({});
  const viewing = useRef<number | null>(null);
  const markTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const update = useCallback((peer: number, fn: (t: Thread) => Thread) => {
    ref.current = { ...ref.current, [peer]: fn(ref.current[peer] ?? EMPTY) };
    setThreads(ref.current);
  }, []);

  const markRead = useCallback((peer: number) => {
    clearTimeout(markTimers.current.get(peer));
    markTimers.current.set(peer, setTimeout(async () => {
      const theirs = ref.current[peer]?.messages.filter((m) => m.member_id === peer).at(-1);
      if (viewing.current !== peer || document.hidden) return;
      // Mesmo sem a conversa carregada, a pessoa está a vê-la: o servidor trata de tudo até à última recebida.
      const upTo = theirs?.id ?? Number.MAX_SAFE_INTEGER;
      try {
        await post(`/api/dm/${peer}/read`, { up_to: upTo });
        patchState((s) => ({ ...s, dm: withoutUnread(s.dm, peer) }));
      } catch { /* tenta de novo na próxima mensagem */ }
    }, 250));
  }, [patchState]);

  const ensureLoaded = useCallback(async (peer: number) => {
    if (ref.current[peer]?.loaded) return;
    try {
      const res = await get<Page>(`/api/dm/${peer}`);
      update(peer, () => ({ messages: res.messages, loaded: true, hasMore: res.has_more }));
    } catch (e) { toast.error(errorMessage(e)); }
  }, [toast, update]);

  const loadOlder = useCallback(async (peer: number) => {
    const first = ref.current[peer]?.messages[0];
    if (!first) return;
    try {
      const res = await get<Page>(`/api/dm/${peer}?before=${first.id}`);
      update(peer, (t) => ({ ...t, messages: [...res.messages, ...t.messages], hasMore: res.has_more }));
    } catch (e) { toast.error(errorMessage(e)); }
  }, [toast, update]);

  /** Chegou (ou enviámos) uma mensagem: junta-a à conversa e ao resumo. */
  const addMessage = useCallback((msg: ChatMessage) => {
    const peer = msg.member_id === meId ? msg.to_id : msg.member_id;
    if (peer === undefined) return;
    const known = ref.current[peer]?.messages.some((m) => m.id === msg.id) ?? false;
    if (known) return;
    if (ref.current[peer]?.loaded) update(peer, (t) => ({ ...t, messages: [...t.messages, msg] }));
    const mine = msg.member_id === meId;
    const watching = viewing.current === peer && !document.hidden;
    patchState((s) => ({ ...s, dm: withMessage(s.dm, peer, msg, mine ? 'keep' : watching ? 'clear' : 'add') }));
    if (!mine && viewing.current === peer) markRead(peer);
  }, [markRead, meId, patchState, update]);

  // Voltámos ao separador com a conversa à vista: o que chegou entretanto conta como lido.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden && viewing.current !== null) markRead(viewing.current); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  useEffect(() => {
    const offMsg = live.on('dm', addMessage);
    const offDel = live.on('dm-deleted', ({ id, from_id, to_id }) => {
      const peer = from_id === meId ? to_id : from_id;
      update(peer, (t) => ({ ...t, messages: t.messages.filter((m) => m.id !== id) }));
      void refresh(); // a última mensagem e o contador mudam
    });
    // A ligação caiu e voltou: trazer o que se perdeu nas conversas já abertas.
    const offBack = live.on('reconnected', () => {
      for (const [key, t] of Object.entries(ref.current)) {
        if (!t.loaded) continue;
        const peer = Number(key);
        void get<Page>(`/api/dm/${peer}`).then((res) => update(peer, (cur) => {
          const have = new Set(cur.messages.map((m) => m.id));
          const merged = [...cur.messages, ...res.messages.filter((m) => !have.has(m.id))].sort((a, b) => a.id - b.id);
          return { ...cur, messages: merged };
        })).catch(() => {});
      }
    });
    return () => { offMsg(); offDel(); offBack(); };
  }, [addMessage, meId, refresh, update]);

  const send = useCallback(async (peer: number, text: string) => {
    try {
      addMessage(await post<ChatMessage>(`/api/dm/${peer}`, { text }));
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }, [addMessage, toast]);

  const remove = useCallback(async (peer: number, id: number) => {
    try {
      await del(`/api/dm/messages/${id}`);
      update(peer, (t) => ({ ...t, messages: t.messages.filter((m) => m.id !== id) }));
      await refresh();
    } catch (e) { toast.error(errorMessage(e)); }
  }, [refresh, toast, update]);

  const setViewing = useCallback((peer: number | null) => {
    viewing.current = peer;
    if (peer !== null) markRead(peer);
  }, [markRead]);

  const thread = useCallback((peer: number) => threads[peer] ?? EMPTY, [threads]);

  const value = useMemo<DmApi>(
    () => ({ thread, ensureLoaded, loadOlder, send, remove, setViewing, markRead }),
    [thread, ensureLoaded, loadOlder, send, remove, setViewing, markRead],
  );
  return <DmContext value={value}>{children}</DmContext>;
}
