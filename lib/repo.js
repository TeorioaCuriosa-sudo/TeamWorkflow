// Tarefas, tarefas recorrentes, ausências, histórico e exportações.
import { tx, setTaskTopics, parseIds } from './db.js';
import { listFor } from './files.js';
import { logEvent } from './notify.js';
import { HttpError, bad, notFound, forbidden, text, oneOf, optionalDate, id, idList } from './validate.js';
import { isDate } from './dates.js';
import { isAdmin, taskAccess, urgency as parseUrgency, NOT_YOURS, URGENCY_PT } from './perms.js';

export { HttpError };

export const STATUS_PT = { todo: 'Por fazer', doing: 'Em progresso', done: 'Concluída' };
const KIND_PT = { monthly: 'Mensal', flex: 'Semanal/diária' };

/** O quadro tem três colunas: Pendentes (por fazer), Em progresso e Concluídas. */
export const columnOf = (t) => t.status;

const nextPosition = (db) => db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM tasks').get().p;

function requireMember(db, memberId) {
  const m = db.prepare('SELECT id, name, active, removed_at FROM members WHERE id = ?').get(memberId);
  if (!m || m.removed_at) throw bad('Pessoa inexistente.');
  return m;
}

function optionalProject(db, value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const pid = id(value, 'Projeto');
  if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw bad('Projeto inexistente.');
  return pid;
}

function checkTopics(db, ids) {
  if (ids === undefined) return undefined;
  for (const t of ids) if (!db.prepare('SELECT 1 FROM topics WHERE id = ?').get(t)) throw bad('Tópico inexistente.');
  return ids;
}

// ---------- leitura enriquecida ----------

const placeholders = (arr) => arr.map(() => '?').join(',');

/** Junta tópicos, última aprovação e atualizações a cada tarefa. */
export function enrichTasks(db, tasks) {
  if (!tasks.length) return tasks;
  const ids = tasks.map((t) => t.id);
  const ph = placeholders(ids);

  const topics = new Map();
  for (const r of db.prepare(`SELECT task_id, topic_id FROM task_topics WHERE task_id IN (${ph}) ORDER BY topic_id`).all(...ids)) {
    if (!topics.has(r.task_id)) topics.set(r.task_id, []);
    topics.get(r.task_id).push(r.topic_id);
  }
  const approvals = new Map(
    db.prepare(`SELECT * FROM approvals WHERE id IN (SELECT MAX(id) FROM approvals WHERE task_id IN (${ph}) GROUP BY task_id)`)
      .all(...ids).map((a) => [a.task_id, a]),
  );
  const comments = new Map(
    db.prepare(`SELECT task_id, COUNT(*) AS n, MAX(id) AS last_id FROM task_events WHERE type = 'comment' AND task_id IN (${ph}) GROUP BY task_id`)
      .all(...ids).map((c) => [c.task_id, c]),
  );
  const fileCounts = new Map(
    db.prepare(`SELECT owner_id, COUNT(*) AS n FROM attachments WHERE owner_type = 'task' AND owner_id IN (${ph}) GROUP BY owner_id`)
      .all(...ids).map((c) => [c.owner_id, c.n]),
  );
  const lastIds = [...comments.values()].map((c) => c.last_id);
  const lastTexts = new Map(
    lastIds.length
      ? db.prepare(`SELECT id, text, member_id, created_at FROM task_events WHERE id IN (${placeholders(lastIds)})`).all(...lastIds).map((e) => [e.id, e])
      : [],
  );

  return tasks.map((t) => {
    const c = comments.get(t.id);
    const a = approvals.get(t.id);
    return {
      ...t,
      topic_ids: topics.get(t.id) ?? [],
      approval: a ? { id: a.id, status: a.status, approver_id: a.approver_id, requested_by: a.requested_by, request_note: a.request_note, response_note: a.response_note, created_at: a.created_at, decided_at: a.decided_at } : null,
      comments: c ? c.n : 0,
      file_count: fileCounts.get(t.id) ?? 0,
      last_comment: c ? lastTexts.get(c.last_id) ?? null : null,
    };
  });
}

export function getTask(db, taskId) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!t) throw notFound('Tarefa não encontrada.');
  return enrichTasks(db, [t])[0];
}

export function getTaskDetail(db, taskId) {
  const task = getTask(db, taskId);
  const events = db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY id').all(taskId)
    .map((e) => ({ ...e, meta: JSON.parse(e.meta || '{}') }));
  const approvals = db.prepare('SELECT * FROM approvals WHERE task_id = ? ORDER BY id').all(taskId);
  return { task, events, approvals, files: listFor(db, 'task', taskId) };
}

export function getRecurring(db) {
  return db
    .prepare('SELECT id, member_id, title, notes, active, project_id, topic_ids FROM recurring ORDER BY member_id, position, id')
    .all()
    .map((r) => ({ ...r, topic_ids: parseIds(r.topic_ids) }));
}

export function getHistory(db, currentMonth) {
  const rows = db
    .prepare(
      `SELECT month, member_id, COUNT(*) AS total, SUM(status = 'done') AS done
       FROM tasks GROUP BY month, member_id`,
    )
    .all();
  const carried = db
    .prepare(`SELECT month, COUNT(*) AS n FROM tasks WHERE origin_month != month GROUP BY month`)
    .all();
  const carriedOut = db
    .prepare(`SELECT from_month AS month, COUNT(*) AS n FROM task_carries GROUP BY from_month`)
    .all();
  const byMonth = new Map();
  const ensure = (m) => {
    if (!byMonth.has(m)) byMonth.set(m, { month: m, total: 0, done: 0, carried: 0, carried_out: 0, members: [] });
    return byMonth.get(m);
  };
  ensure(currentMonth);
  for (const r of rows) {
    const entry = ensure(r.month);
    entry.total += r.total;
    entry.done += r.done;
    entry.members.push({ member_id: r.member_id, total: r.total, done: r.done });
  }
  for (const c of carried) ensure(c.month).carried = c.n;
  for (const c of carriedOut) ensure(c.month).carried_out = c.n;
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

// ---------- tarefas ----------

/**
 * Criar uma tarefa. Na minha própria coluna (ou sendo administrador) é uma tarefa normal;
 * no cartão de outra pessoa é um pedido: fica em Pendentes dessa pessoa, que decide o que fazer.
 */
export function createTask(db, input, { month, nowIso, actor, fx }) {
  const title = text(input.title, 'O título', { max: 200, required: true });
  const notes = text(input.notes, 'As notas', { max: 2000 }) ?? '';
  const member_id = id(input.member_id, 'Pessoa');
  const assignee = requireMember(db, member_id);
  const forOther = Boolean(actor) && member_id !== actor.id;
  const isRequest = forOther && !isAdmin(actor);
  const kind = isRequest ? 'flex' : oneOf(input.kind ?? 'flex', ['monthly', 'flex'], 'Tipo');
  const status = isRequest ? 'todo' : oneOf(input.status ?? 'todo', ['todo', 'doing', 'done'], 'Estado');
  const due = optionalDate(input.due, 'Data') ?? null;
  const project_id = optionalProject(db, input.project_id) ?? null;
  const topic_ids = checkTopics(db, idList(input.topic_ids, 'Tópicos')) ?? [];
  const urgency = parseUrgency(input.urgency, 'normal');
  const requested_by = forOther ? actor.id : null;

  const task = tx(db, () => {
    let recurring_id = null;
    if (input.repeat && kind === 'monthly' && !isRequest) {
      recurring_id = Number(
        db
          .prepare('INSERT INTO recurring (member_id, title, notes, position, project_id, topic_ids) VALUES (?, ?, ?, ?, ?, ?)')
          .run(member_id, title, notes, nextPosition(db), project_id, JSON.stringify(topic_ids)).lastInsertRowid,
      );
    }
    const res = db
      .prepare(
        `INSERT INTO tasks (member_id, title, notes, kind, status, month, origin_month, due, recurring_id, project_id,
                            position, created_at, started_at, done_at, urgency, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        member_id, title, notes, kind, status, month, month, due, recurring_id, project_id, nextPosition(db), nowIso,
        status !== 'todo' ? nowIso : null,
        status === 'done' ? nowIso : null,
        urgency, requested_by,
      );
    const taskId = Number(res.lastInsertRowid);
    setTaskTopics(db, taskId, topic_ids);
    logEvent(db, {
      task_id: taskId, member_id: actor?.id ?? null, type: 'created', nowIso,
      text: isRequest ? `Pedida por ${actor.name} a ${assignee.name}.` : forOther ? `Criada para ${assignee.name}.` : 'Criada.',
    });
    if (forOther) {
      const what = isRequest ? 'pediu-te' : 'atribuiu-te';
      fx?.notify({
        to: member_id, actor: actor.id, type: isRequest ? 'request' : 'assigned', task_id: taskId,
        text: `${actor.name} ${what} a tarefa “${title}”.`,
        mail: {
          kind: 'update', subject: isRequest ? `Pedido de tarefa: ${title}` : `Nova tarefa para ti: ${title}`,
          lines: [`${actor.name} ${what} a tarefa “${title}”.`, ...(urgency !== 'normal' ? [`Urgência: ${URGENCY_PT[urgency]}.`] : [])],
        },
      });
    }
    return taskId;
  });
  return getTask(db, task);
}

// Campos que quem pediu a tarefa ainda pode corrigir enquanto a outra pessoa não lhe pegou.
const REQUESTER_FIELDS = ['title', 'notes', 'due', 'urgency', 'project_id', 'topic_ids', 'member_id'];

export function updateTask(db, taskId, input, { nowIso, actor, fx }) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!t) throw notFound('Tarefa não encontrada.');

  const access = taskAccess(t, actor);
  if (!access.full && !access.requester) throw forbidden(NOT_YOURS);
  const admin = !actor || isAdmin(actor);

  if (!access.full) {
    // Só mudam os campos do pedido; mover, mudar de estado ou de tipo é com quem recebeu.
    const touchesOther = (input.status !== undefined && input.status !== t.status)
      || (input.kind !== undefined && input.kind !== t.kind)
      || input.before_id != null || input.to_end || input.apply_to_recurring;
    if (touchesOther) throw forbidden('Esta tarefa foi pedida por ti: só a podes corrigir. Quem a recebeu decide o resto.');
  }

  const next = { ...t };
  const title = text(input.title, 'O título', { max: 200 });
  if (title !== undefined) {
    if (!title) throw bad('O título é obrigatório.');
    next.title = title;
  }
  const notes = text(input.notes, 'As notas', { max: 2000 });
  if (notes !== undefined) next.notes = notes;
  let newAssignee = null;
  if (input.member_id !== undefined && id(input.member_id, 'Pessoa') !== t.member_id) {
    if (!admin && access.full) {
      throw forbidden('Só os administradores passam tarefas a outra pessoa. Podes pedir uma tarefa nova no cartão dela.');
    }
    next.member_id = id(input.member_id, 'Pessoa');
    newAssignee = requireMember(db, next.member_id);
    if (!admin && next.member_id === actor.id) throw bad('Escolhe outra pessoa para receber o pedido.');
  }
  if (input.kind !== undefined) next.kind = oneOf(input.kind, ['monthly', 'flex'], 'Tipo');
  if (input.status !== undefined) next.status = oneOf(input.status, ['todo', 'doing', 'done'], 'Estado');
  const due = optionalDate(input.due, 'Data');
  if (due !== undefined) next.due = due;
  next.urgency = parseUrgency(input.urgency, t.urgency);
  const project = optionalProject(db, input.project_id);
  if (project !== undefined) next.project_id = project;
  const topicIds = checkTopics(db, idList(input.topic_ids, 'Tópicos'));

  if (next.status !== t.status) {
    if (next.status === 'doing') next.started_at = t.started_at ?? nowIso;
    if (next.status === 'done') {
      next.started_at = t.started_at ?? nowIso;
      next.done_at = nowIso;
    } else {
      next.done_at = null;
    }
    if (next.status === 'todo') next.started_at = null;
  }
  // Uma tarefa que deixa de ser mensal deixa de ser uma cópia de recorrente.
  if (next.kind === 'flex') next.recurring_id = null;
  // Passar a tarefa a outra pessoa por administrador: quem a pediu deixa de ser relevante se a pessoa a recebeu de si própria.
  if (newAssignee && next.requested_by === next.member_id) next.requested_by = null;

  const movedColumn = columnOf(next) !== columnOf(t) || next.member_id !== t.member_id;
  if (input.before_id !== undefined && input.before_id !== null) {
    const beforeId = id(input.before_id, 'Posição');
    const before = db.prepare('SELECT id, position FROM tasks WHERE id = ? AND month = ?').get(beforeId, t.month);
    if (before && before.id !== t.id) {
      const prev = db
        .prepare(
          `SELECT position FROM tasks
           WHERE month = ? AND member_id = ? AND id != ? AND position < ? AND status = ?
           ORDER BY position DESC LIMIT 1`,
        )
        .get(t.month, next.member_id, t.id, before.position, next.status);
      next.position = prev ? (prev.position + before.position) / 2 : before.position - 1;
    } else if (movedColumn || input.to_end) {
      next.position = nextPosition(db);
    }
  } else if (movedColumn || input.to_end) {
    next.position = nextPosition(db);
  }

  tx(db, () => {
    db.prepare(
      `UPDATE tasks SET title = ?, notes = ?, member_id = ?, kind = ?, status = ?, due = ?, recurring_id = ?,
                        project_id = ?, position = ?, started_at = ?, done_at = ?, urgency = ?, requested_by = ? WHERE id = ?`,
    ).run(
      next.title, next.notes, next.member_id, next.kind, next.status, next.due, next.recurring_id,
      next.project_id, next.position, next.started_at, next.done_at, next.urgency, next.requested_by, t.id,
    );
    if (topicIds !== undefined) setTaskTopics(db, t.id, topicIds);

    // Guardar projeto/tópicos também no modelo recorrente (valem para os próximos meses).
    if (input.apply_to_recurring && t.recurring_id) {
      const finalTopics = topicIds ?? db.prepare('SELECT topic_id FROM task_topics WHERE task_id = ?').all(t.id).map((r) => r.topic_id);
      db.prepare('UPDATE recurring SET project_id = ?, topic_ids = ? WHERE id = ?')
        .run(next.project_id, JSON.stringify(finalTopics), t.recurring_id);
    }

    const by = actor?.id ?? null;
    const statusChanged = next.status !== t.status;
    const assigneeChanged = next.member_id !== t.member_id;
    if (statusChanged) {
      logEvent(db, { task_id: t.id, member_id: by, type: 'status', text: STATUS_PT[next.status], meta: { from: t.status, to: next.status }, nowIso });
    }
    if (next.urgency !== t.urgency) {
      logEvent(db, { task_id: t.id, member_id: by, type: 'status', text: `Urgência: ${URGENCY_PT[next.urgency]}`, meta: { urgency: next.urgency }, nowIso });
    }
    if (assigneeChanged) {
      const from = db.prepare('SELECT name FROM members WHERE id = ?').get(t.member_id)?.name ?? '?';
      logEvent(db, { task_id: t.id, member_id: by, type: 'assigned', text: `${from} → ${newAssignee.name}`, meta: { from: t.member_id, to: next.member_id }, nowIso });
    }
    if (actor && assigneeChanged) {
      const asked = access.requester && !admin;
      fx?.notify({
        to: next.member_id, actor: actor.id, type: asked ? 'request' : 'assigned', task_id: t.id,
        text: `${actor.name} ${asked ? 'pediu-te' : 'atribuiu-te'} a tarefa “${next.title}”.`,
        mail: { kind: 'update', subject: asked ? `Pedido de tarefa: ${next.title}` : `Tarefa atribuída a ti: ${next.title}`, lines: [`${actor.name} ${asked ? 'pediu-te' : 'atribuiu-te'} a tarefa “${next.title}”.`] },
      });
      fx?.notify({
        to: t.member_id, actor: actor.id, type: 'assigned', task_id: t.id,
        text: asked ? `${actor.name} retirou o pedido “${next.title}”.` : `${actor.name} passou “${next.title}” para ${newAssignee.name}.`,
      });
    } else if (actor && statusChanged) {
      fx?.notify({
        to: next.member_id, actor: actor.id, type: 'status', task_id: t.id,
        text: `${actor.name} marcou “${next.title}” como ${STATUS_PT[next.status].toLowerCase()}.`,
        mail: { kind: 'update', subject: `${STATUS_PT[next.status]}: ${next.title}`, lines: [`${actor.name} marcou a tua tarefa “${next.title}” como ${STATUS_PT[next.status].toLowerCase()}.`] },
      });
    }
    // Quem pediu a tarefa fica a saber como ela avança.
    if (actor && statusChanged && next.requested_by && next.requested_by !== actor.id && next.requested_by !== next.member_id) {
      fx?.notify({
        to: next.requested_by, actor: actor.id, type: 'status', task_id: t.id,
        text: `${actor.name} marcou “${next.title}”, que pediste, como ${STATUS_PT[next.status].toLowerCase()}.`,
      });
    } else if (actor && next.requested_by && next.requested_by === actor.id && !assigneeChanged && !statusChanged
      && (next.title !== t.title || next.due !== t.due || next.urgency !== t.urgency || next.notes !== t.notes)) {
      fx?.notify({
        to: next.member_id, actor: actor.id, type: 'request', task_id: t.id,
        text: `${actor.name} corrigiu o pedido “${next.title}”.`,
      });
    }
  });
  return getTask(db, t.id);
}

/** Apagar: quem tem a tarefa, um administrador, ou quem a pediu enquanto ninguém lhe pegou. */
export function deleteTask(db, taskId, { actor, fx } = {}) {
  const t = db.prepare('SELECT id, title, member_id, requested_by, status FROM tasks WHERE id = ?').get(taskId);
  if (!t) throw notFound('Tarefa não encontrada.');
  const access = taskAccess(t, actor);
  if (!access.full && !access.requester) throw forbidden(NOT_YOURS);
  tx(db, () => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    if (!actor) return;
    if (access.requester && !access.full) {
      fx?.notify({ to: t.member_id, actor: actor.id, type: 'request', text: `${actor.name} retirou o pedido “${t.title}”.` });
    } else if (t.requested_by && t.requested_by !== actor.id && t.requested_by !== t.member_id) {
      fx?.notify({ to: t.requested_by, actor: actor.id, type: 'request', text: `${actor.name} removeu a tarefa “${t.title}”, que pediste.` });
    }
  });
}

// ---------- tarefas recorrentes ----------

const recurringRow = (db, rid) => {
  const r = db.prepare('SELECT id, member_id, title, notes, active, project_id, topic_ids FROM recurring WHERE id = ?').get(rid);
  return { ...r, topic_ids: parseIds(r.topic_ids) };
};

export function createRecurring(db, input, { month, nowIso, actor }) {
  const title = text(input.title, 'O título', { max: 200, required: true });
  const notes = text(input.notes, 'As notas', { max: 2000 }) ?? '';
  const member_id = id(input.member_id, 'Pessoa');
  requireMember(db, member_id);
  if (actor && !isAdmin(actor) && member_id !== actor.id) throw forbidden('Só os administradores criam tarefas recorrentes para outra pessoa.');
  const project_id = optionalProject(db, input.project_id) ?? null;
  const topic_ids = checkTopics(db, idList(input.topic_ids, 'Tópicos')) ?? [];
  return tx(db, () => {
    const rid = Number(
      db
        .prepare('INSERT INTO recurring (member_id, title, notes, position, project_id, topic_ids) VALUES (?, ?, ?, ?, ?, ?)')
        .run(member_id, title, notes, nextPosition(db), project_id, JSON.stringify(topic_ids)).lastInsertRowid,
    );
    // Aparece já neste mês, sem esperar pela próxima renovação.
    const res = db.prepare(
      `INSERT INTO tasks (member_id, title, notes, kind, status, month, origin_month, recurring_id, project_id, position, created_at)
       VALUES (?, ?, ?, 'monthly', 'todo', ?, ?, ?, ?, ?, ?)`,
    ).run(member_id, title, notes, month, month, rid, project_id, nextPosition(db), nowIso);
    const taskId = Number(res.lastInsertRowid);
    setTaskTopics(db, taskId, topic_ids);
    logEvent(db, { task_id: taskId, member_id: actor?.id ?? null, type: 'created', text: 'Criada como tarefa recorrente.', nowIso });
    return recurringRow(db, rid);
  });
}

export function updateRecurring(db, rid, input, { actor } = {}) {
  const r = db.prepare('SELECT * FROM recurring WHERE id = ?').get(rid);
  if (!r) throw notFound('Tarefa recorrente não encontrada.');
  if (actor && !isAdmin(actor) && r.member_id !== actor.id) throw forbidden(NOT_YOURS);
  const title = text(input.title, 'O título', { max: 200 });
  if (title === '') throw bad('O título é obrigatório.');
  const notes = text(input.notes, 'As notas', { max: 2000 });
  let member_id = r.member_id;
  if (input.member_id !== undefined && id(input.member_id, 'Pessoa') !== r.member_id) {
    if (actor && !isAdmin(actor)) throw forbidden('Só os administradores passam tarefas recorrentes a outra pessoa.');
    member_id = id(input.member_id, 'Pessoa');
    requireMember(db, member_id);
  }
  const project = optionalProject(db, input.project_id);
  const topicIds = checkTopics(db, idList(input.topic_ids, 'Tópicos'));
  db.prepare('UPDATE recurring SET title = ?, notes = ?, member_id = ?, active = ?, project_id = ?, topic_ids = ? WHERE id = ?').run(
    title ?? r.title,
    notes ?? r.notes,
    member_id,
    input.active === undefined ? r.active : (input.active ? 1 : 0),
    project === undefined ? r.project_id : project,
    topicIds === undefined ? r.topic_ids : JSON.stringify(topicIds),
    rid,
  );
  return recurringRow(db, rid);
}

/** Apaga o modelo. Só remove a cópia deste mês se ainda ninguém lhe tocou (por fazer). */
export function deleteRecurring(db, rid, { month, actor } = {}) {
  const r = db.prepare('SELECT id, member_id FROM recurring WHERE id = ?').get(rid);
  if (!r) throw notFound('Tarefa recorrente não encontrada.');
  if (actor && !isAdmin(actor) && r.member_id !== actor.id) throw forbidden(NOT_YOURS);
  tx(db, () => {
    db.prepare(`DELETE FROM tasks WHERE recurring_id = ? AND month = ? AND status = 'todo'`).run(rid, month);
    db.prepare('DELETE FROM recurring WHERE id = ?').run(rid);
  });
}

// ---------- ausências ----------

function absenceFields(input, existing = {}) {
  const member_id = input.member_id === undefined ? existing.member_id : id(input.member_id, 'Pessoa');
  if (member_id === undefined) throw bad('Pessoa é obrigatória.');
  const start_date = input.start_date === undefined ? existing.start_date : input.start_date;
  const end_date = input.end_date === undefined ? existing.end_date : input.end_date;
  if (!isDate(start_date)) throw bad('Data de início inválida.');
  if (!isDate(end_date)) throw bad('Data de fim inválida.');
  if (end_date < start_date) throw bad('A data de fim não pode ser anterior à de início.');
  const type = oneOf(input.type ?? existing.type ?? 'ferias', ['ferias', 'ausencia', 'formacao'], 'Tipo');
  const note = text(input.note, 'A nota', { max: 200 }) ?? existing.note ?? '';
  return { member_id, start_date, end_date, type, note };
}

export function createAbsence(db, input) {
  const a = absenceFields(input);
  requireMember(db, a.member_id);
  const res = db
    .prepare('INSERT INTO absences (member_id, start_date, end_date, type, note) VALUES (?, ?, ?, ?, ?)')
    .run(a.member_id, a.start_date, a.end_date, a.type, a.note);
  return db.prepare('SELECT * FROM absences WHERE id = ?').get(Number(res.lastInsertRowid));
}

export function updateAbsence(db, aid, input) {
  const existing = db.prepare('SELECT * FROM absences WHERE id = ?').get(aid);
  if (!existing) throw notFound('Ausência não encontrada.');
  const a = absenceFields(input, existing);
  requireMember(db, a.member_id);
  db.prepare('UPDATE absences SET member_id = ?, start_date = ?, end_date = ?, type = ?, note = ? WHERE id = ?').run(
    a.member_id, a.start_date, a.end_date, a.type, a.note, aid,
  );
  return db.prepare('SELECT * FROM absences WHERE id = ?').get(aid);
}

export function deleteAbsence(db, aid) {
  const res = db.prepare('DELETE FROM absences WHERE id = ?').run(aid);
  if (!res.changes) throw notFound('Ausência não encontrada.');
}

// ---------- exportação ----------

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita execução de fórmulas no Excel
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ";" e BOM UTF-8, que é o que o Excel português abre sem pedir nada. */
export function monthCsv(db, month) {
  const rows = db
    .prepare(
      `SELECT t.*, m.name AS member, p.name AS project, rq.name AS requester,
              (SELECT GROUP_CONCAT(tp.name, ', ') FROM task_topics tt JOIN topics tp ON tp.id = tt.topic_id WHERE tt.task_id = t.id) AS topics
       FROM tasks t JOIN members m ON m.id = t.member_id LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN members rq ON rq.id = t.requested_by
       WHERE t.month = ? ORDER BY m.id, t.status = 'done' DESC, t.position`,
    )
    .all(month);
  const head = ['Mês', 'Pessoa', 'Tarefa', 'Tipo', 'Estado', 'Urgência', 'Pedida por', 'Projeto', 'Tópicos', 'Prazo', 'Criada em', 'Concluída em', 'Transitada de', 'Notas'];
  const lines = [head.map(csvCell).join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.month, r.member, r.title, KIND_PT[r.kind], STATUS_PT[r.status], URGENCY_PT[r.urgency], r.requester ?? '', r.project ?? '', r.topics ?? '', r.due ?? '',
        r.created_at.slice(0, 10), r.done_at ? r.done_at.slice(0, 10) : '',
        r.origin_month !== r.month ? r.origin_month : '', r.notes,
      ].map(csvCell).join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Cópia completa em JSON (só para administradores). Não inclui palavras-passe, sessões nem notificações. */
export function fullBackup(db) {
  const all = (sql) => db.prepare(sql).all();
  return {
    exportedAt: new Date().toISOString(),
    members: all(`SELECT id, name, color, active, email, role, func, created_at, removed_at FROM members`),
    recurring: all('SELECT * FROM recurring'),
    tasks: all('SELECT * FROM tasks'),
    absences: all('SELECT * FROM absences'),
    templates: all('SELECT * FROM templates'),
    attachments: all('SELECT id, owner_type, owner_id, name, mime, size, uploaded_by, created_at FROM attachments'),
    meetings: all('SELECT * FROM meetings'),
    meeting_attendees: all('SELECT * FROM meeting_attendees'),
    months: all('SELECT * FROM months'),
    topics: all('SELECT * FROM topics'),
    projects: all('SELECT * FROM projects'),
    task_topics: all('SELECT * FROM task_topics'),
    task_events: all('SELECT * FROM task_events'),
    task_carries: all('SELECT * FROM task_carries'),
    approvals: all('SELECT * FROM approvals'),
    messages: all('SELECT * FROM messages'),
    // De propósito, sem direct_messages: as conversas privadas são só de quem as teve (nem o administrador as exporta).
  };
}
