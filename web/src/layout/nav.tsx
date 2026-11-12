import type { ReactNode } from 'react';
import { CalendarDays, History, LayoutDashboard, MessageSquare, Settings } from 'lucide-react';
import type { AppState } from '../api/types';
import { NAV, type ViewId } from '../lib/labels';

const ICONS: Record<ViewId, ReactNode> = {
  workflow: <LayoutDashboard />,
  ausencias: <CalendarDays />,
  historico: <History />,
  chat: <MessageSquare />,
  definicoes: <Settings />,
};

export interface NavEntry {
  id: ViewId;
  label: string;
  icon: ReactNode;
  badge: number;
}

/** As secções da aplicação, com os contadores (pedidos por aprovar, mensagens por ler). */
export function navEntries(data: Pick<AppState, 'pending_approvals' | 'chat_unread'>): NavEntry[] {
  return NAV.map((n) => ({
    id: n.id,
    label: n.label,
    icon: ICONS[n.id],
    badge: n.id === 'workflow' ? data.pending_approvals.length : n.id === 'chat' ? data.chat_unread : 0,
  }));
}
