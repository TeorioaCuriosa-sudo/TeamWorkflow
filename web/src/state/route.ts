// Navegação por "#": #workflow, #workflow/2026-10 (mês arquivado), #calendario, #chat…
// Usamos o # em vez de endereços normais para o servidor não precisar de saber destas páginas.

import { useSyncExternalStore } from 'react';
import { isMonth } from '../lib/dates';
import { isView, type ViewId } from '../lib/labels';

export interface Route {
  view: ViewId;
  /** Só no Workflow: um mês passado (arquivo). null = mês atual. */
  month: string | null;
  /** Só nos Modelos: mensais ou semanais (#modelos/weekly). */
  kind: 'monthly' | 'weekly' | null;
  /** #chat/3 abre a conversa privada com a pessoa 3 (null = o chat da equipa). */
  peerId: number | null;
  /** #task/12 abre a tarefa 12 (ligação dos emails e dos avisos). */
  taskId: number | null;
  /** #meeting/5 abre a reunião 5 no calendário (ligação dos emails e dos avisos). */
  meetingId: number | null;
}

let lastView: ViewId = 'workflow';

function parse(hash: string): Route {
  const [raw, param] = hash.replace(/^#/, '').split('/');
  const first = raw === 'ausencias' ? 'calendario' : raw; // o nome antigo da secção continua a funcionar
  if (first === 'task' && /^\d+$/.test(param ?? '')) return { view: lastView, month: null, kind: null, peerId: null, taskId: Number(param), meetingId: null };
  if (first === 'meeting' && /^\d+$/.test(param ?? '')) {
    lastView = 'calendario';
    return { view: 'calendario', month: null, kind: null, peerId: null, taskId: null, meetingId: Number(param) };
  }
  const view: ViewId = isView(first) ? first : 'workflow';
  lastView = view;
  return {
    view,
    month: view === 'workflow' && isMonth(param) ? param : null,
    kind: view === 'modelos' ? (param === 'weekly' ? 'weekly' : 'monthly') : null,
    peerId: view === 'chat' && /^\d+$/.test(param ?? '') ? Number(param) : null,
    taskId: null,
    meetingId: null,
  };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const snapshot = () => location.hash;

/** A rota atual. Muda sempre que o "#" do endereço muda. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '');
  return parse(hash);
}

/** `sub` é o mês (no Workflow), o tipo de modelo (nos Modelos) ou a pessoa da conversa (no Chat). */
export function hrefFor(view: ViewId, sub?: string | null): string {
  return sub ? `#${view}/${sub}` : `#${view}`;
}

export function go(view: ViewId, sub?: string | null): void {
  location.hash = hrefFor(view, sub);
}

/** Depois de abrir uma tarefa ou reunião por ligação, volta ao endereço normal sem a acrescentar ao histórico. */
export function clearLinkFromUrl(): void {
  history.replaceState(null, '', `#${lastView}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
