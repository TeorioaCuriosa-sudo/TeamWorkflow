// Mensagens privadas entre duas pessoas. Só quem escreveu e quem recebeu as leem: não existe nenhuma rota que as
// mostre a terceiros (administradores incluídos) e ficam de fora da cópia JSON. Cada rota trabalha sempre sobre as
// conversas de quem pede.
import { bad, forbidden, notFound, text } from './validate.js';

export const MAX_LEN = 2000;
const PREVIEW = 120;

/** Mesmo formato das mensagens do chat da equipa (`member_id` é quem escreveu), com `to_id` a mais. */
const present = (r) => ({ id: r.id, member_id: r.from_id, to_id: r.to_id, text: r.text, created_at: r.created_at });

/** A outra pessoa tem de existir, não ser quem escreve e ainda ter conta. */
function peerOf(db, actor, peerId) {
  if (peerId === actor.id) throw bad('Não podes escrever mensagens a ti próprio.');
  const m = db.prepare('SELECT id, removed_at, password_hash FROM members WHERE id = ?').get(peerId);
  if (!m || m.removed_at) throw notFound('Pessoa não encontrada.');
  return m;
}

export function listThread(db, actor, peerId, { before, limit = 50 } = {}) {
  peerOf(db, actor, peerId);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const b = Number.isInteger(Number(before)) && Number(before) > 0 ? Number(before) : null;
  const rows = db
    .prepare(
      `SELECT id, from_id, to_id, text, created_at FROM direct_messages
       WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND (? IS NULL OR id < ?)
       ORDER BY id DESC LIMIT ?`,
    )
    .all(actor.id, peerId, peerId, actor.id, b, b, lim + 1);
  return { messages: rows.slice(0, lim).reverse().map(present), has_more: rows.length > lim };
}

export function sendDirect(db, actor, peerId, input, { nowIso }) {
  const peer = peerOf(db, actor, peerId);
  if (!peer.password_hash) throw bad('Esta pessoa ainda não tem conta, por isso não pode ler mensagens.');
  const body = text(input.text, 'A mensagem', { max: MAX_LEN, required: true });
  const mid = Number(
    db.prepare('INSERT INTO direct_messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(actor.id, peerId, body, nowIso).lastInsertRowid,
  );
  // Quem responde já leu o que recebeu.
  db.prepare('UPDATE direct_messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL AND id < ?').run(nowIso, peerId, actor.id, mid);
  return present(db.prepare('SELECT id, from_id, to_id, text, created_at FROM direct_messages WHERE id = ?').get(mid));
}

/** Só quem escreveu a apaga (nem o administrador). Devolve as duas pessoas, para avisar o ecrã de ambas. */
export function deleteDirect(db, mid, actor) {
  const m = db.prepare('SELECT id, from_id, to_id FROM direct_messages WHERE id = ?').get(mid);
  if (!m || (m.from_id !== actor.id && m.to_id !== actor.id)) throw notFound('Mensagem não encontrada.');
  if (m.from_id !== actor.id) throw forbidden('Só podes apagar as mensagens que escreveste.');
  db.prepare('DELETE FROM direct_messages WHERE id = ?').run(mid);
  return { id: m.id, from_id: m.from_id, to_id: m.to_id };
}

export function markDirectRead(db, actor, peerId, input, { nowIso }) {
  peerOf(db, actor, peerId);
  const upTo = Number(input.up_to);
  if (!Number.isInteger(upTo) || upTo < 0) throw bad('Mensagem inválida.');
  db.prepare('UPDATE direct_messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL AND id <= ?').run(nowIso, peerId, actor.id, upTo);
}

/**
 * As conversas de quem está a ver: uma por pessoa, com a última mensagem (cortada) e quantas estão por ler.
 * Vai no estado da interface, por isso os contadores e as pré-visualizações nunca precisam de um pedido à parte.
 */
export function conversations(db, viewerId) {
  const rows = db
    .prepare(
      `SELECT d.peer AS peer_id, d.last_id, d.unread
       FROM (
         SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS peer, MAX(id) AS last_id,
                SUM(CASE WHEN to_id = ? AND read_at IS NULL THEN 1 ELSE 0 END) AS unread
         FROM direct_messages WHERE from_id = ? OR to_id = ? GROUP BY peer
       ) d JOIN members m ON m.id = d.peer
       WHERE m.removed_at IS NULL
       ORDER BY d.last_id DESC`,
    )
    .all(viewerId, viewerId, viewerId, viewerId);
  const last = db.prepare('SELECT id, from_id, text, created_at FROM direct_messages WHERE id = ?');
  return rows.map((r) => {
    const m = last.get(r.last_id);
    return {
      peer_id: r.peer_id,
      unread: Number(r.unread),
      last: { id: m.id, member_id: m.from_id, text: m.text.length > PREVIEW ? `${m.text.slice(0, PREVIEW)}…` : m.text, created_at: m.created_at },
    };
  });
}
