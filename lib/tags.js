// Tópicos (etiquetas com cor, várias por tarefa) e projetos (cada tarefa pertence a um, no máximo).
import { tx, TAG_COLORS, parseIds } from './db.js';
import { bad, notFound, conflict, text, color } from './validate.js';

const KINDS = {
  topics: { table: 'topics', label: 'O tópico', one: 'tópico' },
  projects: { table: 'projects', label: 'O projeto', one: 'projeto' },
};

function make(kind) {
  const { table, label, one } = KINDS[kind];

  const get = (db, tid) => {
    const row = db.prepare(`SELECT id, name, color FROM ${table} WHERE id = ?`).get(tid);
    if (!row) throw notFound(`${one[0].toUpperCase()}${one.slice(1)} não encontrado.`);
    return row;
  };

  const uniqueName = (fn) => {
    try { return fn(); } catch (err) {
      if (/UNIQUE constraint failed/i.test(String(err?.message))) throw conflict(`Já existe um ${one} com esse nome.`);
      throw err;
    }
  };

  return {
    list: (db) => db.prepare(`SELECT id, name, color FROM ${table} ORDER BY lower(name)`).all(),

    create(db, input, { nowIso }) {
      const name = text(input.name, label, { max: 40, required: true });
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
      if (n >= 60) throw bad(`Limite de ${one}s atingido.`);
      const col = input.color ? color(input.color) : TAG_COLORS[n % TAG_COLORS.length];
      const tid = uniqueName(() => Number(db.prepare(`INSERT INTO ${table} (name, color, created_at) VALUES (?, ?, ?)`).run(name, col, nowIso).lastInsertRowid));
      return get(db, tid);
    },

    update(db, tid, input) {
      const row = get(db, tid);
      const name = text(input.name, label, { max: 40 });
      if (name === '') throw bad(`${label} precisa de um nome.`);
      uniqueName(() => db.prepare(`UPDATE ${table} SET name = ?, color = ? WHERE id = ?`)
        .run(name ?? row.name, input.color === undefined ? row.color : color(input.color), tid));
      return get(db, tid);
    },

    /** Apagar não apaga tarefas: só as deixa sem este tópico/projeto (e tira-o dos modelos recorrentes). */
    remove(db, tid) {
      get(db, tid);
      tx(db, () => {
        if (kind === 'topics') {
          for (const r of db.prepare(`SELECT id, topic_ids FROM recurring WHERE topic_ids != '[]'`).all()) {
            const kept = parseIds(r.topic_ids).filter((x) => x !== tid);
            db.prepare('UPDATE recurring SET topic_ids = ? WHERE id = ?').run(JSON.stringify(kept), r.id);
          }
        }
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(tid);
      });
    },
  };
}

export const topics = make('topics');
export const projects = make('projects');
