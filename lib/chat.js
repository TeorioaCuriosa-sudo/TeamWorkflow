// Chat da equipa: um único canal para todos.
import { bad, notFound, forbidden, text } from './validate.js';

export const MAX_LEN = 2000;

export function listMessages(db, { before, limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const b = Number.isInteger(Number(before)) && Number(before) > 0 ? Number(before) : null;
  const rows = db
    .prepare(
      `SELECT id, member_id, text, created_at FROM messages WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`,
    )
    .all(b, b, lim + 1);
  const has_more = rows.length > lim;
  return { messages: rows.slice(0, lim).reverse(), has_more };
}

export function postMessage(db, actor, input, { nowIso }) {
  const body = text(input.text, 'A mensagem', { max: MAX_LEN, required: true });
  const mid = Number(db.prepare('INSERT INTO messages (member_id, text, created_at) VALUES (?, ?, ?)').run(actor.id, body, nowIso).lastInsertRowid);
  db.prepare('UPDATE members SET chat_read_id = MAX(chat_read_id, ?) WHERE id = ?').run(mid, actor.id);
  return db.prepare('SELECT id, member_id, text, created_at FROM messages WHERE id = ?').get(mid);
}

export function deleteMessage(db, mid, actor) {
  const m = db.prepare('SELECT id, member_id FROM messages WHERE id = ?').get(mid);
  if (!m) throw notFound('Mensagem não encontrada.');
  if (m.member_id !== actor.id && actor.role !== 'admin') throw forbidden('Só podes apagar as tuas mensagens.');
  db.prepare('DELETE FROM messages WHERE id = ?').run(mid);
}

export function markChatRead(db, actor, input) {
  const upTo = Number(input.up_to);
  if (!Number.isInteger(upTo) || upTo < 0) throw bad('Mensagem inválida.');
  db.prepare('UPDATE members SET chat_read_id = MAX(chat_read_id, ?) WHERE id = ?').run(upTo, actor.id);
}

export const chatUnread = (db, memberId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE id > (SELECT chat_read_id FROM members WHERE id = ?) AND member_id != ?`,
    )
    .get(memberId, memberId).n;
