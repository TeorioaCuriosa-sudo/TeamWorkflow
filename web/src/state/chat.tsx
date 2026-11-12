// O chat da equipa. Vive acima das páginas para continuar a receber mensagens (e a contar
// as por ler) mesmo quando não estamos a olhar para ele.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { del, errorMessage, get, post } from '../api/client';
import { live } from '../api/events';
import type { ChatMessage } from '../api/types';
import { useToast } from '../ui/Toast';
import { useData } from './data';

interface ChatApi {
  messages: ChatMessage[];
  loaded: boolean;
  hasMore: boolean;
  ensureLoaded: () => Promise<void>;
  loadOlder: () => Promise<void>;
  send: (text: string) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  /** A página do chat chama isto enquanto está à vista, para as mensagens novas contarem como lidas. */
  setViewing: (viewing: boolean) => void;
  markRead: () => void;
}

const ChatContext = createContext<ChatApi | null>(null);

export function useChat(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat fora do ChatProvider');
  return ctx;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { data, patchState } = useData();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const meId = data.me.id;
  const loadedRef = useRef(false);
  const viewing = useRef(false);
  const markTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A lista "verdadeira" vive numa ref (para decisões imediatas); o estado serve para desenhar.
  const listRef = useRef<ChatMessage[]>([]);
  const update = useCallback((fn: (l: ChatMessage[]) => ChatMessage[]) => {
    listRef.current = fn(listRef.current);
    setMessages(listRef.current);
  }, []);

  const setUnread = useCallback((fn: (n: number) => number) => {
    patchState((s) => ({ ...s, chat_unread: fn(s.chat_unread ?? 0) }));
  }, [patchState]);

  const markRead = useCallback(() => {
    clearTimeout(markTimer.current);
    markTimer.current = setTimeout(async () => {
      const id = listRef.current.at(-1)?.id ?? 0;
      if (!id || !viewing.current || document.hidden) return;
      try {
        await post('/api/chat/read', { up_to: id });
        setUnread(() => 0);
      } catch { /* tenta de novo na próxima mensagem */ }
    }, 250);
  }, [setUnread]);

  const ensureLoaded = useCallback(async () => {
    if (loadedRef.current) return;
    try {
      const res = await get<{ messages: ChatMessage[]; has_more: boolean }>('/api/chat');
      loadedRef.current = true;
      update(() => res.messages);
      setHasMore(res.has_more);
      setLoaded(true);
    } catch (e) { toast.error(errorMessage(e)); }
  }, [toast, update]);

  const loadOlder = useCallback(async () => {
    const first = messages[0];
    if (!first) return;
    try {
      const res = await get<{ messages: ChatMessage[]; has_more: boolean }>(`/api/chat?before=${first.id}`);
      update((m) => [...res.messages, ...m]);
      setHasMore(res.has_more);
    } catch (e) { toast.error(errorMessage(e)); }
  }, [messages, toast, update]);

  const addMessage = useCallback((msg: ChatMessage) => {
    if (!loadedRef.current) {
      if (msg.member_id !== meId) setUnread((n) => n + 1);
      return;
    }
    if (listRef.current.some((m) => m.id === msg.id)) return;
    update((list) => [...list, msg]);
    if (viewing.current) markRead();
    else if (msg.member_id !== meId) setUnread((n) => n + 1);
  }, [markRead, meId, setUnread, update]);

  useEffect(() => {
    const offMsg = live.on('chat', addMessage);
    const offDel = live.on('chat-deleted', ({ id }) => update((list) => list.filter((m) => m.id !== id)));
    return () => { offMsg(); offDel(); };
  }, [addMessage, update]);

  const send = useCallback(async (text: string) => {
    try {
      const msg = await post<ChatMessage>('/api/chat', { text });
      addMessage(msg);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }, [addMessage, toast]);

  const remove = useCallback(async (id: number) => {
    try {
      await del(`/api/chat/${id}`);
      update((list) => list.filter((m) => m.id !== id));
    } catch (e) { toast.error(errorMessage(e)); }
  }, [toast, update]);

  const setViewing = useCallback((v: boolean) => {
    viewing.current = v;
    if (v) markRead();
  }, [markRead]);

  const value = useMemo<ChatApi>(
    () => ({ messages, loaded, hasMore, ensureLoaded, loadOlder, send, remove, setViewing, markRead }),
    [messages, loaded, hasMore, ensureLoaded, loadOlder, send, remove, setViewing, markRead],
  );
  return <ChatContext value={value}>{children}</ChatContext>;
}
