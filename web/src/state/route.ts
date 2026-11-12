// Navegação por "#": #workflow, #workflow/2026-10 (mês arquivado), #ausencias, #chat…
// Usamos o # em vez de endereços normais para o servidor não precisar de saber destas páginas.

import { useSyncExternalStore } from 'react';
import { isMonth } from '../lib/dates';
import { isView, type ViewId } from '../lib/labels';

export interface Route {
  view: ViewId;
  /** Só no Workflow: um mês passado (arquivo). null = mês atual. */
  month: string | null;
  /** #task/12 abre a tarefa 12 (ligação dos emails e dos avisos). */
  taskId: number | null;
}

let lastView: ViewId = 'workflow';

function parse(hash: string): Route {
  const [first, param] = hash.replace(/^#/, '').split('/');
  if (first === 'task' && /^\d+$/.test(param ?? '')) return { view: lastView, month: null, taskId: Number(param) };
  const view: ViewId = isView(first) ? first : 'workflow';
  lastView = view;
  return { view, month: view === 'workflow' && isMonth(param) ? param : null, taskId: null };
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

export function hrefFor(view: ViewId, month?: string | null): string {
  return month ? `#${view}/${month}` : `#${view}`;
}

export function go(view: ViewId, month?: string | null): void {
  location.hash = hrefFor(view, month);
}

/** Depois de abrir uma tarefa por ligação, volta ao endereço normal sem a acrescentar ao histórico. */
export function clearTaskFromUrl(): void {
  history.replaceState(null, '', `#${lastView}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
