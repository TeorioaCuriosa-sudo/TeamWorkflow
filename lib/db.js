import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const COLORS = [
  '#2f6fed', '#e0662b', '#1f9d7a', '#a855c7',
  '#d6336c', '#b8860b', '#5b6b7c', '#c0392b',
];

// Cores para tópicos e projetos (distintas das da equipa para não se confundirem).
export const TAG_COLORS = [
  '#0e7490', '#7c3aed', '#be185d', '#b45309',
  '#15803d', '#1d4ed8', '#9f1239', '#475569',
];

const SCHEMA_V1 = `
CREATE TABLE members (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE recurring (
  id        INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  title     TEXT NOT NULL,
  notes     TEXT NOT NULL DEFAULT '',
  active    INTEGER NOT NULL DEFAULT 1,
  position  REAL NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY,
  member_id    INTEGER NOT NULL REFERENCES members(id),
  title        TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL CHECK (kind IN ('monthly','flex')),
  status       TEXT NOT NULL CHECK (status IN ('todo','doing','done')),
  month        TEXT NOT NULL,
  origin_month TEXT NOT NULL,
  due          TEXT,
  recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
  position     REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  done_at      TEXT
);
CREATE INDEX tasks_month ON tasks(month);
CREATE INDEX tasks_recurring ON tasks(recurring_id, month);

CREATE TABLE absences (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'ferias' CHECK (type IN ('ferias','ausencia','formacao')),
  note       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX absences_dates ON absences(start_date, end_date);

CREATE TABLE months (
  month     TEXT PRIMARY KEY,
  opened_at TEXT NOT NULL
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// v2: contas individuais, tópicos, projetos, atualizações, aprovações, notificações e chat.
const SCHEMA_V2 = `
ALTER TABLE members ADD COLUMN email TEXT;
ALTER TABLE members ADD COLUMN password_hash TEXT;
ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member'));
ALTER TABLE members ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE members ADD COLUMN status_text TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN status_until TEXT;
ALTER TABLE members ADD COLUMN mail_approvals INTEGER NOT NULL DEFAULT 1;
ALTER TABLE members ADD COLUMN mail_updates INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN chat_read_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN last_seen TEXT;
ALTER TABLE members ADD COLUMN created_at TEXT;
ALTER TABLE members ADD COLUMN removed_at TEXT;
CREATE UNIQUE INDEX members_email ON members(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used  TEXT NOT NULL
);
CREATE INDEX sessions_member ON sessions(member_id);

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX projects_name ON projects(lower(name));

CREATE TABLE topics (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX topics_name ON topics(lower(name));

ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE recurring ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE recurring ADD COLUMN topic_ids TEXT NOT NULL DEFAULT '[]';

CREATE TABLE task_topics (
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, topic_id)
);
CREATE INDEX task_topics_topic ON task_topics(topic_id);

CREATE TABLE task_events (
  id         INTEGER PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id  INTEGER REFERENCES members(id),
  type       TEXT NOT NULL CHECK (type IN ('created','status','assigned','comment','approval')),
  text       TEXT NOT NULL DEFAULT '',
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX task_events_task ON task_events(task_id, id);

CREATE TABLE approvals (
  id            INTEGER PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  requested_by  INTEGER NOT NULL REFERENCES members(id),
  approver_id   INTEGER NOT NULL REFERENCES members(id),
  status        TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
  request_note  TEXT NOT NULL DEFAULT '',
  response_note TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  decided_at    TEXT
);
CREATE INDEX approvals_task ON approvals(task_id, id);
CREATE INDEX approvals_pending ON approvals(approver_id, status);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES members(id),
  type       TEXT NOT NULL,
  text       TEXT NOT NULL,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX notifications_member ON notifications(member_id, read_at, id);

CREATE TABLE messages (
  id         INTEGER PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const { user_version } = db.prepare('PRAGMA user_version').get();
  if (user_version > MIGRATIONS.length) {
    throw new Error(`A base de dados foi criada por uma versão mais recente da aplicação (esquema ${user_version}).`);
  }
  for (let v = user_version; v < MIGRATIONS.length; v += 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* já terminada */ }
      throw err;
    }
  }
  return db;
}

const inTx = new WeakSet();

/** Transação (reentrante: se já houver uma a decorrer, junta-se a ela). */
export function tx(db, fn) {
  if (inTx.has(db)) return fn();
  db.exec('BEGIN IMMEDIATE');
  inTx.add(db);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* já terminada */ }
    throw err;
  } finally {
    inTx.delete(db);
  }
}

export const parseIds = (json) => {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter(Number.isInteger) : [];
  } catch { return []; }
};

/** Substitui os tópicos de uma tarefa (ignora tópicos que já não existem). */
export function setTaskTopics(db, taskId, topicIds) {
  db.prepare('DELETE FROM task_topics WHERE task_id = ?').run(taskId);
  const ins = db.prepare('INSERT OR IGNORE INTO task_topics (task_id, topic_id) SELECT ?, id FROM topics WHERE id = ?');
  for (const tid of topicIds) ins.run(taskId, tid);
}

/**
 * Renovação mensal. Corre uma única vez por mês (a tabela `months` serve de trinco):
 *  1. as tarefas semanais/diárias por concluir e tudo o que estava em progresso transitam para o mês novo;
 *  2. as tarefas mensais por concluir ficam no mês antigo (aparecem como "não concluídas" no histórico);
 *  3. cada tarefa recorrente ativa gera a sua cópia do mês novo (exceto se já existir uma transitada),
 *     com o mesmo projeto e tópicos do modelo.
 */
export function ensureMonth(db, month, nowIso) {
  if (db.prepare('SELECT 1 FROM months WHERE month = ?').get(month)) return false;
  return tx(db, () => {
    if (db.prepare('SELECT 1 FROM months WHERE month = ?').get(month)) return false;
    db.prepare('INSERT INTO months (month, opened_at) VALUES (?, ?)').run(month, nowIso);

    db.prepare(
      `UPDATE tasks SET month = ?
       WHERE month < ? AND status != 'done' AND (kind = 'flex' OR status = 'doing')`,
    ).run(month, month);

    const templates = db.prepare(
      `SELECT r.* FROM recurring r JOIN members m ON m.id = r.member_id
       WHERE r.active = 1 AND m.active = 1 AND m.removed_at IS NULL
       ORDER BY r.member_id, r.position, r.id`,
    ).all();
    const exists = db.prepare('SELECT 1 FROM tasks WHERE recurring_id = ? AND month = ?');
    const insert = db.prepare(
      `INSERT INTO tasks (member_id, title, notes, kind, status, month, origin_month, recurring_id, project_id, position, created_at)
       VALUES (?, ?, ?, 'monthly', 'todo', ?, ?, ?, ?, ?, ?)`,
    );
    let pos = db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM tasks').get().p;
    for (const r of templates) {
      if (exists.get(r.id, month)) continue;
      pos += 1;
      const res = insert.run(r.member_id, r.title, r.notes, month, month, r.id, r.project_id, pos, nowIso);
      const taskId = Number(res.lastInsertRowid);
      setTaskTopics(db, taskId, parseIds(r.topic_ids));
      db.prepare(`INSERT INTO task_events (task_id, member_id, type, text, created_at) VALUES (?, NULL, 'created', 'Criada pela renovação mensal.', ?)`)
        .run(taskId, nowIso);
    }
    return true;
  });
}
