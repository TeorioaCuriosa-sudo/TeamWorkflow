// Mensagens privadas: pequenas contas sobre a lista de conversas que vem no estado.

import type { AppState, ChatMessage, DirectConversation } from '../api/types';

export const dmUnreadTotal = (dm: DirectConversation[]) => dm.reduce((n, c) => n + c.unread, 0);

export const unreadFrom = (dm: DirectConversation[], peerId: number) => dm.find((c) => c.peer_id === peerId)?.unread ?? 0;

/** Tudo o que há por ler no Chat: equipa e conversas privadas. */
export const chatUnreadTotal = (s: Pick<AppState, 'chat_unread' | 'dm'>) => (s.chat_unread ?? 0) + dmUnreadTotal(s.dm ?? []);

/**
 * A lista de conversas depois de chegar (ou sair) uma mensagem. `unread`: 'add' soma uma por ler,
 * 'clear' põe a zero, 'keep' deixa como está. A conversa mais recente passa para o topo.
 */
export function withMessage(dm: DirectConversation[], peerId: number, msg: ChatMessage, unread: 'add' | 'clear' | 'keep'): DirectConversation[] {
  const before = dm.find((c) => c.peer_id === peerId);
  const count = unread === 'add' ? (before?.unread ?? 0) + 1 : unread === 'clear' ? 0 : before?.unread ?? 0;
  const next: DirectConversation = { peer_id: peerId, unread: count, last: { id: msg.id, member_id: msg.member_id, text: msg.text.length > 120 ? `${msg.text.slice(0, 120)}…` : msg.text, created_at: msg.created_at } };
  return [next, ...dm.filter((c) => c.peer_id !== peerId)];
}

export const withoutUnread = (dm: DirectConversation[], peerId: number): DirectConversation[] =>
  dm.map((c) => (c.peer_id === peerId ? { ...c, unread: 0 } : c));
