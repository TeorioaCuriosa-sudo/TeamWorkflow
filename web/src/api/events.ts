// A ligação em direto ao servidor (Server-Sent Events). É uma só para toda a aplicação:
// quem precisa de saber "alguém mexeu em alguma coisa" ou "chegou uma mensagem" subscreve aqui.

import { CLIENT_ID } from './client';
import type { ChatMessage } from './types';

type Status = 'idle' | 'online' | 'offline';

interface EventMap {
  /** Outra pessoa (ou outro separador) alterou dados. */
  changed: { from?: string };
  chat: ChatMessage;
  'chat-deleted': { id: number };
  /** A ligação caiu e voltou: convém voltar a pedir tudo. */
  reconnected: undefined;
  /** A ligação caiu: pode ser a sessão que terminou. */
  dropped: undefined;
}

type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

class Live {
  private es: EventSource | null = null;
  private listeners = new Map<string, Set<(data: never) => void>>();
  private statusListeners = new Set<(s: Status) => void>();
  status: Status = 'idle';

  private setStatus(s: Status) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  private emit<K extends keyof EventMap>(type: K, data: EventMap[K]) {
    this.listeners.get(type)?.forEach((fn) => (fn as Listener<K>)(data));
  }

  on<K extends keyof EventMap>(type: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn as (data: never) => void);
    return () => this.listeners.get(type)?.delete(fn as (data: never) => void);
  }

  onStatus(fn: (s: Status) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  connect() {
    if (this.es) return;
    const es = new EventSource('/api/events');
    this.es = es;
    es.onopen = () => {
      const wasOffline = this.status === 'offline';
      this.setStatus('online');
      if (wasOffline) this.emit('reconnected', undefined);
    };
    es.onerror = () => {
      this.setStatus('offline');
      this.emit('dropped', undefined);
    };
    const parse = <T,>(e: MessageEvent): T | null => {
      try { return JSON.parse(e.data) as T; } catch { return null; }
    };
    es.addEventListener('changed', (e) => {
      const data = parse<{ from?: string }>(e as MessageEvent) ?? {};
      if (data.from === CLIENT_ID) return; // fomos nós a mexer: já temos os dados
      this.emit('changed', data);
    });
    es.addEventListener('chat', (e) => {
      const data = parse<ChatMessage>(e as MessageEvent);
      if (data) this.emit('chat', data);
    });
    es.addEventListener('chat-deleted', (e) => {
      const data = parse<{ id: number }>(e as MessageEvent);
      if (data) this.emit('chat-deleted', data);
    });
  }

  close() {
    this.es?.close();
    this.es = null;
    this.setStatus('idle');
  }
}

export const live = new Live();
