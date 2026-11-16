import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { cap, monthLabel } from '../lib/dates';
import { chatUnreadTotal } from '../lib/dm';
import type { ViewId } from '../lib/labels';
import { useData } from '../state/data';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const SECTION_TITLE: Record<Exclude<ViewId, 'workflow'>, string> = {
  calendario: 'Calendário', projetos: 'Projetos', modelos: 'Modelos', historico: 'Histórico', chat: 'Chat', definicoes: 'Definições',
};

/** A moldura de toda a aplicação: barra lateral (ou barra de baixo no telemóvel), cabeçalho e a página. */
export function AppShell({ view, children }: { view: ViewId; children: ReactNode }) {
  const { data } = useData();

  // O separador do browser mostra a secção e quantos avisos há por ler.
  useEffect(() => {
    const section = view === 'workflow' ? cap(monthLabel(data.month)) : SECTION_TITLE[view];
    const unread = chatUnreadTotal(data) + data.unread;
    document.title = `${unread ? `(${unread}) ` : ''}Teoria Workflow · ${section}`;
  }, [view, data.month, data.chat_unread, data.dm, data.unread]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar view={view} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav view={view} />
    </div>
  );
}
