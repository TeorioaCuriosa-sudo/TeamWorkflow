// Quem pode mexer em quê. O servidor decide sempre; isto só serve para a interface
// não oferecer botões que iam dar erro.

import type { Me, Task } from '../api/types';

/**
 * full: é a minha tarefa (ou sou administrador) e mexo em tudo.
 * requester: pedi esta tarefa a outra pessoa e ela ainda não lhe pegou; posso corrigir ou retirar o pedido.
 * view: só vejo e comento.
 */
export type TaskAccess = 'full' | 'requester' | 'view';

export function taskAccess(task: Pick<Task, 'member_id' | 'requested_by' | 'status'>, me: Pick<Me, 'id' | 'role'>): TaskAccess {
  if (me.role === 'admin' || task.member_id === me.id) return 'full';
  if (task.requested_by === me.id && task.status === 'todo') return 'requester';
  return 'view';
}
