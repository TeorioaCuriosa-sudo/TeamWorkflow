// Tarefas, tarefas recorrentes, ausências, histórico e exportações.
import { tx, setTaskTopics, parseIds } from './db.js';
import { logEvent } from './notify.js';
import { HttpError, bad, notFound, text, oneOf, optionalDate, id, idList } from './validate.js';
import { isDate } from './dates.js';

export { HttpError };

export const STATUS_PT = { todo: 'Por fazer', doing: 'Em progresso', done: 'Concluída' };
const KIND_PT = { monthly: 'Mensal', flex: 'Semanal/diária' };

export const columnOf = (t) =>
  t.status === 'doing' ? 'doing' : t.status === 'done' ? 'done' : t.kind === 'monthly' ? 'monthly' : 'flex';

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
  return { task, events, approvals };
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
  const byMonth = new Map();
  const ensure = (m) => {
    if (!byMonth.has(m)) byMonth.set(m, { month: m, total: 0, done: 0, carried: 0, members: [] });
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
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

// ---------- tarefas ----------

export function createTask(db, input, { month, nowIso, actor, fx }) {
  const title = text(input.title, 'O título', { max: 200, required: true });
  const notes = text(input.notes, 'As notas', { max: 2000 }) ?? '';
  const member_id = id(input.member_id, 'Pessoa');
  const assignee = requireMember(db, member_id);
  const kind = oneOf(input.kind ?? 'flex', ['monthly', 'flex'], 'Tipo');
  const status = oneOf(input.status ?? 'todo', ['todo', 'doing', 'done'], 'Estado');
  const due = optionalDate(input.due, 'Data') ?? null;
  const project_id = optionalProject(db, input.project_id) ?? null;
  const topic_ids = checkTopics(db, idList(input.topic_ids, 'Tópicos')) ?? [];

  const task = tx(db, () => {
    let recurring_id = null;
    if (input.repeat && kind === 'monthly') {
      recurring_id = Number(
        db
          .prepare('INSERT INTO recurring (member_id, title, notes, position, project_id, topic_ids) VALUES (?, ?, ?, ?, ?, ?)')
          .run(member_id, title, notes, nextPosition(db), project_id, JSON.stringify(topic_ids)).lastInsertRowid,
      );
    }
    const res = db
      .prepare(
        `INSERT INTO tasks (member_id, title, notes, kind, status, month, origin_month, due, recurring_id, project_id,
                            position, created_at, started_at, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        member_id, title, notes, kind, status, month, month, due, recurring_id, project_id, nextPosition(db), nowIso,
        status !== 'todo' ? nowIso : null,
        status === 'done' ? nowIso : null,
      );
    const taskId = Number(res.lastInsertRowid);
    setTaskTopics(db, taskId, topic_ids);
    logEvent(db, { task_id: taskId, member_id: actor?.id ?? null, type: 'created', text: `Criada para ${assignee.name}.`, nowIso });
    if (actor && member_id !== actor.id) {
      fx?.notify({
        to: member_id, actor: actor.id, type: 'assigned', task_id: taskId,
        text: `${actor.name} atribuiu-te a tarefa “${title}”.`,
        mail: { kind: 'update', subject: `Nova tarefa para ti: ${title}`, lines: [`${actor.name} atribuiu-te a tarefa “${title}”.`] },
      });
    }
    return taskId;
  });
  return getTask(db, task);
}

export function updateTask(db, taskId, input, { nowIso, actor, fx }) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!t) throw notFound('Tarefa não encontrada.');

  const next = { ...t };
  const title = text(input.title, 'O título', { max: 200 });
  if (title !== undefined) {
    if (!title) throw bad('O título é obrigatório.');
    next.title = title;
  }
  const notes = text(input.notes, 'As notas', { max: 2000 });
  if (notes !== undefined) next.notes = notes;
  let newAssignee = null;
  if (input.member_id !== undefined) {
    next.member_id = id(input.member_id, 'Pessoa');
    newAssignee = requireMember(db, next.member_id);
  }
  if (input.kind !== undefined) next.kind = oneOf(input.kind, ['monthly', 'flex'], 'Tipo');
  if (input.status !== undefined) next.status = oneOf(input.status, ['todo', 'doing', 'done'], 'Estado');
  const due = optionalDate(input.due, 'Data');
  if (due !== undefined) next.due = due;
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

  const movedColumn = columnOf(next) !== columnOf(t) || next.member_id !== t.member_id;
  if (input.before_id !== undefined && input.before_id !== null) {
    const beforeId = id(input.before_id, 'Posição');
    const before = db.prepare('SELECT id, position FROM tasks WHERE id = ? AND month = ?').get(beforeId, t.month);
    if (before && before.id !== t.id) {
      const col = columnOf(next);
      const prev = db
        .prepare(
          `SELECT position FROM tasks
           WHERE month = ? AND member_id = ? AND id != ? AND position < ?
             AND (CASE WHEN status = 'doing' THEN 'doing' WHEN status = 'done' THEN 'done'
                       WHEN kind = 'monthly' THEN 'monthly' ELSE 'flex' END) = ?
           ORDER BY position DESC LIMIT 1`,
        )
        .get(t.month, next.member_id, t.id, before.position, col);
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
                        project_id = ?, position = ?, started_at = ?, done_at = ? WHERE id = ?`,
    ).run(
      next.title, next.notes, next.member_id, next.kind, next.status, next.due, next.recurring_id,
      next.project_id, next.position, next.started_at, next.done_at, t.id,
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
    if (assigneeChanged) {
      const from = db.prepare('SELECT name FROM members WHERE id = ?').get(t.member_id)?.name ?? '?';
      logEvent(db, { task_id: t.id, member_id: by, type: 'assigned', text: `${from} → ${newAssignee.name}`, meta: { from: t.member_id, to: next.member_id }, nowIso });
    }
    if (actor && assigneeChanged) {
      fx?.notify({
        to: next.member_id, actor: actor.id, type: 'assigned', task_id: t.id,
        text: `${actor.name} atribuiu-te a tarefa “${next.title}”.`,
        mail: { kind: 'update', subject: `Tarefa atribuída a ti: ${next.title}`, lines: [`${actor.name} atribuiu-te a tarefa “${next.title}”.`] },
      });
      fx?.notify({
        to: t.member_id, actor: actor.id, type: 'assigned', task_id: t.id,
        text: `${actor.name} passou “${next.title}” para ${newAssignee.name}.`,
      });
    } else if (actor && statusChanged) {
      fx?.notify({
        to: next.member_id, actor: actor.id, type: 'status', task_id: t.id,
        text: `${actor.name} marcou “${next.title}” como ${STATUS_PT[next.status].toLowerCase()}.`,
        mail: { kind: 'update', subject: `${STATUS_PT[next.status]}: ${next.title}`, lines: [`${actor.name} marcou a tua tarefa “${next.title}” como ${STATUS_PT[next.status].toLowerCase()}.`] },
      });
    }
  });
  return getTask(db, t.id);
}

export function deleteTask(db, taskId) {
  const res = db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  if (!res.changes) throw notFound('Tarefa não encontrada.');
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

export function updateRecurring(db, rid, input) {
  const r = db.prepare('SELECT * FROM recurring WHERE id = ?').get(rid);
  if (!r) throw notFound('Tarefa recorrente não encontrada.');
  const title = text(input.title, 'O título', { max: 200 });
  if (title === '') throw bad('O título é obrigatório.');
  const notes = text(input.notes, 'As notas', { max: 2000 });
  let member_id = r.member_id;
  if (input.member_id !== undefined) {
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
export function deleteRecurring(db, rid, { month }) {
  const r = db.prepare('SELECT id FROM recurring WHERE id = ?').get(rid);
  if (!r) throw notFound('Tarefa recorrente não encontrada.');
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
      `SELECT t.*, m.name AS member, p.name AS project,
              (SELECT GROUP_CONCAT(tp.name, ', ') FROM task_topics tt JOIN topics tp ON tp.id = tt.topic_id WHERE tt.task_id = t.id) AS topics
       FROM tasks t JOIN members m ON m.id = t.member_id LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.month = ? ORDER BY m.id, t.status = 'done' DESC, t.position`,
    )
    .all(month);
  const head = ['Mês', 'Pessoa', 'Tarefa', 'Tipo', 'Estado', 'Projeto', 'Tópicos', 'Prazo', 'Criada em', 'Concluída em', 'Transitada de', 'Notas'];
  const lines = [head.map(csvCell).join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.month, r.member, r.title, KIND_PT[r.kind], STATUS_PT[r.status], r.project ?? '', r.topics ?? '', r.due ?? '',
        r.created_at.slice(0, 10), r.done_at ? r.done_at.slice(0, 10) : '',
        r.origin_month !== r.month ? r.origin_month : '', r.notes,
      ].map(csvCell).join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Cópia completa em JSON. Não inclui palavras-passe, sessões nem notificações. */
export function fullBackup(db) {
  const all = (sql) => db.prepare(sql).all();
  return {
    exportedAt: new Date().toISOString(),
    members: all(`SELECT id, name, color, active, email, role, created_at, removed_at FROM members`),
    recurring: all('SELECT * FROM recurring'),
    tasks: all('SELECT * FROM tasks'),
    absences: all('SELECT * FROM absences'),
    months: all('SELECT * FROM months'),
    topics: all('SELECT * FROM topics'),
    projects: all('SELECT * FROM projects'),
    task_topics: all('SELECT * FROM task_topics'),
    task_events: all('SELECT * FROM task_events'),
    approvals: all('SELECT * FROM approvals'),
    messages: all('SELECT * FROM messages'),
  };
}
