// Modelos de tarefas mensais e semanais: guardam-se uma vez (título, notas, projeto, tópicos, urgência e ficheiros)
// e aplicam-se com um clique no cartão de uma pessoa. No cartão de outra pessoa, o resultado é um pedido, como qualquer outro.
import { tx, parseIds } from './db.js';
import * as files from './files.js';
import * as repo from './repo.js';
import { isCommander, urgency as parseUrgency } from './perms.js';
import { bad, forbidden, notFound, id, idList, oneOf, text } from './validate.js';

const MAX_TEMPLATES = 80;
const KINDS = ['monthly', 'weekly'];

const present = (r) => ({
  id: r.id, title: r.title, notes: r.notes, kind: r.kind, urgency: r.urgency, project_id: r.project_id,
  topic_ids: parseIds(r.topic_ids), created_by: r.created_by, created_at: r.created_at,
});

export const listTemplates = (db) => db.prepare('SELECT * FROM templates ORDER BY kind DESC, lower(title), id').all().map(present);

function getRow(db, tid) {
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(tid);
  if (!row) throw notFound('Modelo não encontrado.');
  return row;
}

function projectId(db, value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const pid = id(value, 'Projeto');
  if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw bad('Projeto inexistente.');
  return pid;
}

function topicIds(db, value) {
  const ids = idList(value, 'Tópicos');
  if (ids === undefined) return undefined;
  for (const t of ids) if (!db.prepare('SELECT 1 FROM topics WHERE id = ?').get(t)) throw bad('Tópico inexistente.');
  return ids;
}

export function createTemplate(db, input, { nowIso, actor }) {
  const title = text(input.title, 'O título', { max: 200, required: true });
  const notes = text(input.notes, 'As notas', { max: 2000 }) ?? '';
  const kind = oneOf(input.kind, KINDS, 'Tipo');
  const urgency = parseUrgency(input.urgency, 'normal');
  const project = projectId(db, input.project_id) ?? null;
  const topics = topicIds(db, input.topic_ids) ?? [];
  if (db.prepare('SELECT COUNT(*) AS n FROM templates').get().n >= MAX_TEMPLATES) throw bad(`Limite de ${MAX_TEMPLATES} modelos atingido.`);
  const res = db
    .prepare('INSERT INTO templates (title, notes, kind, urgency, project_id, topic_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(title, notes, kind, urgency, project, JSON.stringify(topics), actor.id, nowIso);
  return present(getRow(db, Number(res.lastInsertRowid)));
}

const canChange = (row, actor) => row.created_by === actor.id || isCommander(actor);
const NOT_ALLOWED = 'Só quem criou o modelo, os comandantes e os administradores o podem alterar.';

export function updateTemplate(db, tid, input, { actor }) {
  const row = getRow(db, tid);
  if (!canChange(row, actor)) throw forbidden(NOT_ALLOWED);
  const title = text(input.title, 'O título', { max: 200 });
  if (title === '') throw bad('O título é obrigatório.');
  const notes = text(input.notes, 'As notas', { max: 2000 });
  const kind = input.kind === undefined ? row.kind : oneOf(input.kind, KINDS, 'Tipo');
  const project = projectId(db, input.project_id);
  const topics = topicIds(db, input.topic_ids);
  db.prepare('UPDATE templates SET title = ?, notes = ?, kind = ?, urgency = ?, project_id = ?, topic_ids = ? WHERE id = ?').run(
    title ?? row.title,
    notes ?? row.notes,
    kind,
    parseUrgency(input.urgency, row.urgency),
    project === undefined ? row.project_id : project,
    topics === undefined ? row.topic_ids : JSON.stringify(topics),
    tid,
  );
  return present(getRow(db, tid));
}

export function deleteTemplate(db, tid, { actor }) {
  const row = getRow(db, tid);
  if (!canChange(row, actor)) throw forbidden(NOT_ALLOWED);
  db.prepare('DELETE FROM templates WHERE id = ?').run(tid); // os ficheiros órfãos são apagados a seguir (files.purgeOrphans)
}

/**
 * Cria uma tarefa a partir do modelo no cartão de `member_id`. As regras são as de qualquer tarefa nova:
 * na tua coluna (ou sendo administrador) é uma tarefa normal; no cartão de outra pessoa é um pedido.
 * Os ficheiros do modelo são copiados para a tarefa.
 */
export function applyTemplate(db, tid, input, { month, nowIso, actor, fx, uploadsDir }) {
  const row = getRow(db, tid);
  const member_id = id(input.member_id, 'Pessoa');
  return tx(db, () => {
    // Projeto e tópicos que entretanto foram apagados simplesmente ficam de fora.
    const topics = parseIds(row.topic_ids).filter((t) => db.prepare('SELECT 1 FROM topics WHERE id = ?').get(t));
    const task = repo.createTask(db, {
      title: row.title,
      notes: row.notes,
      member_id,
      kind: row.kind === 'monthly' ? 'monthly' : 'flex',
      urgency: row.urgency,
      project_id: row.project_id,
      topic_ids: topics,
    }, { month, nowIso, actor, fx });
    files.copyAll(db, uploadsDir, { type: 'template', id: tid }, { type: 'task', id: task.id }, { actor, nowIso });
    return repo.getTask(db, task.id);
  });
}
