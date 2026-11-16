import type { ReactNode } from 'react';
import { CalendarDays, FolderKanban, History, LayoutDashboard, MessageSquare, Settings } from 'lucide-react';
import type { AppState } from '../api/types';
import { chatUnreadTotal } from '../lib/dm';
import { NAV, type NavId } from '../lib/labels';

const ICONS: Record<NavId, ReactNode> = {
  workflow: <LayoutDashboard />,
  calendario: <CalendarDays />,
  projetos: <FolderKanban />,
  historico: <History />,
  chat: <MessageSquare />,
  definicoes: <Settings />,
};

export interface NavEntry {
  id: NavId;
  label: string;
  icon: ReactNode;
  badge: number;
}

/** As secções da aplicação, com os contadores (pedidos por aprovar, mensagens por ler: da equipa e privadas). */
export function navEntries(data: Pick<AppState, 'pending_approvals' | 'chat_unread' | 'dm'>): NavEntry[] {
  return NAV.map((n) => ({
    id: n.id,
    label: n.label,
    icon: ICONS[n.id],
    badge: n.id === 'workflow' ? data.pending_approvals.length : n.id === 'chat' ? chatUnreadTotal(data) : 0,
  }));
}
