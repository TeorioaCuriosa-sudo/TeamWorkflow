// Atualizações das tarefas, pedidos de aprovação e notificações dentro da app.
import { tx } from './db.js';
import { logEvent } from './notify.js';
import * as repo from './repo.js';
import { bad, notFound, forbidden, conflict, text, id, idList, oneOf } from './validate.js';
import { isAdmin } from './perms.js';

const clip = (s, n = 280) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function taskOrThrow(db, taskId) {
  const t = db.prepare('SELECT id, title, member_id, status FROM tasks WHERE id = ?').get(taskId);
  if (!t) throw notFound('Tarefa não encontrada.');
  return t;
}

// ---------- atualizações ----------

/** Uma atualização é uma nota na linha do tempo da tarefa e, opcionalmente, uma mudança de estado. */
export function addUpdate(db, taskId, input, { nowIso, actor, fx }) {
  const t = taskOrThrow(db, taskId);
  const body = text(input.text, 'A atualização', { max: 2000 });
  const newStatus = input.status === undefined ? t.status : oneOf(input.status, ['todo', 'doing', 'done'], 'Estado');
  const statusChanged = newStatus !== t.status;
  if (!body && !statusChanged) throw bad('Escreve a atualização ou muda o estado.');

  tx(db, () => {
    if (statusChanged) repo.updateTask(db, taskId, { status: newStatus }, { nowIso, actor, fx });
    if (!body) return;
    logEvent(db, { task_id: taskId, member_id: actor.id, type: 'comment', text: body, nowIso });

    // Avisa o responsável e quem já participou na conversa (comentários e aprovações).
    const people = new Set([t.member_id]);
    for (const r of db.prepare(`SELECT DISTINCT member_id FROM task_events WHERE task_id = ? AND type = 'comment' AND member_id IS NOT NULL`).all(taskId)) people.add(r.member_id);
    for (const r of db.prepare('SELECT requested_by, approver_id FROM approvals WHERE task_id = ?').all(taskId)) { people.add(r.requested_by); people.add(r.approver_id); }
    if (statusChanged) people.delete(t.member_id); // já foi avisado da mudança de estado
    for (const to of people) {
      fx.notify({
        to, actor: actor.id, type: 'comment', task_id: taskId,
        text: `${actor.name} escreveu em “${t.title}”: ${clip(body, 120)}`,
        mail: { kind: 'update', subject: `Atualização: ${t.title}`, lines: [`${actor.name} escreveu em “${t.title}”:`, clip(body)] },
      });
    }
  });
  return repo.getTaskDetail(db, taskId);
}

// ---------- aprovações ----------

export function requestApproval(db, taskId, input, { nowIso, actor, fx }) {
  const t = taskOrThrow(db, taskId);
  if (t.member_id !== actor.id && !isAdmin(actor)) throw forbidden('Só quem tem a tarefa (ou um administrador) pode pedir aprovação.');
  const approverId = id(input.approver_id, 'Quem aprova');
  const approver = db.prepare('SELECT id, name, removed_at FROM members WHERE id = ?').get(approverId);
  if (!approver || approver.removed_at) throw bad('Pessoa inexistente.');
  if (approverId === actor.id) throw bad('Escolhe outra pessoa para aprovar.');
  const note = text(input.note, 'A nota', { max: 500 }) ?? '';
  if (db.prepare(`SELECT 1 FROM approvals WHERE task_id = ? AND status = 'pending'`).get(taskId)) {
    throw conflict('Esta tarefa já tem um pedido de aprovação pendente.');
  }
  return tx(db, () => {
    const aid = Number(db.prepare(
      `INSERT INTO approvals (task_id, requested_by, approver_id, status, request_note, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).run(taskId, actor.id, approverId, note, nowIso).lastInsertRowid);
    logEvent(db, {
      task_id: taskId, member_id: actor.id, type: 'approval', meta: { approval_id: aid, status: 'pending' }, nowIso,
      text: `Pediu aprovação a ${approver.name}.${note ? ` ${note}` : ''}`,
    });
    fx.notify({
      to: approverId, actor: actor.id, type: 'approval_request', task_id: taskId,
      text: `${actor.name} pediu a tua aprovação: “${t.title}”.`,
      mail: {
        kind: 'approval', subject: `Pedido de aprovação: ${t.title}`,
        lines: [`${actor.name} pediu a tua aprovação para a tarefa “${t.title}”.`, ...(note ? [`Nota: ${note}`] : [])],
        cta: 'Rever e responder',
      },
    });
    return db.prepare('SELECT * FROM approvals WHERE id = ?').get(aid);
  });
}

function approvalOrThrow(db, aid) {
  const a = db.prepare('SELECT * FROM approvals WHERE id = ?').get(aid);
  if (!a) throw notFound('Pedido de aprovação não encontrado.');
  return a;
}

export function decideApproval(db, aid, input, { nowIso, actor, fx }) {
  const a = approvalOrThrow(db, aid);
  if (a.status !== 'pending') throw conflict('Este pedido já foi respondido.');
  if (actor.id !== a.approver_id && !isAdmin(actor)) throw forbidden('Só a pessoa a quem foi pedido (ou um administrador) pode responder.');
  const decision = oneOf(input.decision, ['approved', 'rejected'], 'Resposta');
  const note = text(input.note, 'A nota', { max: 500 }) ?? '';
  const t = taskOrThrow(db, a.task_id);
  const verb = decision === 'approved' ? 'aprovou' : 'rejeitou';
  tx(db, () => {
    db.prepare('UPDATE approvals SET status = ?, response_note = ?, decided_at = ? WHERE id = ?').run(decision, note, nowIso, aid);
    logEvent(db, {
      task_id: a.task_id, member_id: actor.id, type: 'approval', meta: { approval_id: aid, status: decision }, nowIso,
      text: `${decision === 'approved' ? 'Aprovou' : 'Rejeitou'}.${note ? ` ${note}` : ''}`,
    });
    fx.notify({
      to: a.requested_by, actor: actor.id, type: 'approval_result', task_id: a.task_id,
      text: `${actor.name} ${verb} “${t.title}”.`,
      mail: {
        kind: 'approval', subject: `${decision === 'approved' ? 'Aprovada' : 'Rejeitada'}: ${t.title}`,
        lines: [`${actor.name} ${verb} o teu pedido para a tarefa “${t.title}”.`, ...(note ? [`Nota: ${note}`] : [])],
      },
    });
  });
  return db.prepare('SELECT * FROM approvals WHERE id = ?').get(aid);
}

export function cancelApproval(db, aid, { nowIso, actor, fx }) {
  const a = approvalOrThrow(db, aid);
  if (a.status !== 'pending') throw conflict('Este pedido já foi respondido.');
  if (actor.id !== a.requested_by && !isAdmin(actor)) throw forbidden('Só quem fez o pedido (ou um administrador) o pode cancelar.');
  const t = taskOrThrow(db, a.task_id);
  tx(db, () => {
    db.prepare(`UPDATE approvals SET status = 'cancelled', decided_at = ? WHERE id = ?`).run(nowIso, aid);
    logEvent(db, { task_id: a.task_id, member_id: actor.id, type: 'approval', meta: { approval_id: aid, status: 'cancelled' }, nowIso, text: 'Cancelou o pedido de aprovação.' });
    fx.notify({ to: a.approver_id, actor: actor.id, type: 'approval_result', task_id: a.task_id, text: `${actor.name} cancelou o pedido de aprovação de “${t.title}”.` });
  });
  return db.prepare('SELECT * FROM approvals WHERE id = ?').get(aid);
}

export function pendingFor(db, memberId) {
  return db
    .prepare(
      `SELECT a.id, a.task_id, a.requested_by, a.request_note, a.created_at, t.title, t.month
       FROM approvals a JOIN tasks t ON t.id = a.task_id
       WHERE a.approver_id = ? AND a.status = 'pending' ORDER BY a.id`,
    )
    .all(memberId);
}

// ---------- notificações ----------

export const unreadCount = (db, memberId) =>
  db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ? AND read_at IS NULL').get(memberId).n;

export function listNotifications(db, memberId, limit = 40) {
  const items = db
    .prepare('SELECT id, actor_id, type, text, task_id, meeting_id, created_at, read_at FROM notifications WHERE member_id = ? ORDER BY id DESC LIMIT ?')
    .all(memberId, limit);
  return { items, unread: unreadCount(db, memberId) };
}

export function markRead(db, memberId, input, nowIso) {
  if (input.all) {
    db.prepare('UPDATE notifications SET read_at = ? WHERE member_id = ? AND read_at IS NULL').run(nowIso, memberId);
    return;
  }
  const ids = idList(input.ids, 'Notificações', 200) ?? [];
  const upd = db.prepare('UPDATE notifications SET read_at = ? WHERE member_id = ? AND id = ? AND read_at IS NULL');
  for (const nid of ids) upd.run(nowIso, memberId, nid);
}

/** Notificações com mais de 90 dias já não interessam a ninguém. */
export function pruneNotifications(db, nowIso) {
  const cutoff = new Date(Date.parse(nowIso) - 90 * 24 * 3600_000).toISOString();
  db.prepare('DELETE FROM notifications WHERE created_at < ?').run(cutoff);
}
