// Funções e permissões. Um administrador pode tudo. As outras funções vivem na coluna `func`:
//  - comandante: altera e apaga tópicos e projetos, adiciona pessoas e pede tarefas a toda a gente;
//  - marketing e informática: acesso igual ao de um membro (a função serve para a equipa se situar);
//  - membro: mexe nas suas tarefas, cria tópicos e projetos e pede tarefas aos outros.
// Ninguém, fora os administradores, mexe nas tarefas de outra pessoa: só pode pedir-lhe uma tarefa nova.
import { forbidden, oneOf } from './validate.js';

export const FUNCS = ['member', 'comandante', 'marketing', 'informatica'];
export const ROLES = ['admin', ...FUNCS];
export const URGENCIES = ['normal', 'urgent', 'priority', 'critical'];
export const URGENCY_PT = { normal: 'Normal', urgent: 'Urgente', priority: 'Prioritário', critical: 'Business critical' };

/** A "função" que a interface vê: administrador, ou a função de quem não o é. */
export const roleOf = (m) => (m.role === 'admin' ? 'admin' : m.func || 'member');

export const isAdmin = (u) => Boolean(u) && u.role === 'admin';
export const isCommander = (u) => isAdmin(u) || u?.func === 'comandante';

/** Converte a função escolhida na interface nas duas colunas da base de dados. */
export function splitRole(value, label = 'Função') {
  oneOf(value, ROLES, label);
  return value === 'admin' ? { role: 'admin', func: 'member' } : { role: 'member', func: value };
}

/** Funções que `actor` pode dar ao adicionar uma pessoa. */
export function rolesCreatableBy(actor) {
  if (isAdmin(actor)) return ROLES;
  if (isCommander(actor)) return ['member', 'marketing', 'informatica'];
  return [];
}

/** O que a interface pode mostrar ou esconder (o servidor volta a verificar tudo). */
export function capabilities(u) {
  return {
    create_tags: Boolean(u),
    manage_tags: isCommander(u),
    manage_files: isCommander(u),
    add_people: isCommander(u),
    manage_people: isAdmin(u),
    move_others: isAdmin(u),
    backup: isAdmin(u),
  };
}

export function requireCommander(user, what = 'fazer isto') {
  if (!isCommander(user)) throw forbidden(`Só comandantes e administradores podem ${what}.`);
}

/** Quem pode fazer o quê numa tarefa. Sem `actor` (tarefas internas) vale como administrador. */
export function taskAccess(task, actor) {
  if (!actor || isAdmin(actor)) return { full: true, requester: false };
  if (task.member_id === actor.id) return { full: true, requester: false };
  // Quem pediu a tarefa pode corrigi-la ou retirá-la enquanto a outra pessoa ainda não lhe pegou.
  const requester = task.requested_by === actor.id && task.status === 'todo';
  return { full: false, requester };
}

export const NOT_YOURS = 'Só podes mexer nas tuas tarefas. Para pedir algo a outra pessoa, cria um pedido no cartão dela.';

export function urgency(value, fallback = undefined) {
  if (value === undefined) return fallback;
  return oneOf(value, URGENCIES, 'Urgência');
}
