// Pessoas, contas, perfil e estado. Uma "pessoa" é ao mesmo tempo o espaço de trabalho no quadro e a conta de acesso.
import { tx, COLORS } from './db.js';
import { logEvent } from './notify.js';
import { roleOf, isAdmin, splitRole, rolesCreatableBy, capabilities } from './perms.js';
import { hashPassword, verifyPassword, checkPassword, randomPassword } from './auth.js';
import { HttpError, bad, notFound, forbidden, conflict, text, oneOf, id, color, email, bool } from './validate.js';

export const STATUS_KEYS = ['available', 'busy', 'meeting', 'remote', 'break'];
export const MAX_PEOPLE = 12;

const COLS = `id, name, color, active, email, password_hash, role, func, must_change_password, status, status_text,
  status_until, mail_approvals, mail_updates, chat_read_id, last_seen, created_at, removed_at`;

export const getMember = (db, mid) => db.prepare(`SELECT ${COLS} FROM members WHERE id = ?`).get(mid);

function liveMember(db, mid) {
  const m = getMember(db, mid);
  if (!m || m.removed_at) throw notFound('Pessoa não encontrada.');
  return m;
}

/** Um estado com prazo volta a "Disponível" quando o prazo passa. */
export function effectiveStatus(m, nowIso) {
  if (m.status !== 'available' && m.status_until && m.status_until <= nowIso) {
    return { status: 'available', status_text: '', status_until: null };
  }
  return { status: m.status, status_text: m.status_text, status_until: m.status_until };
}

export function publicMember(m, { viewer, onlineIds, nowIso }) {
  const eff = effectiveStatus(m, nowIso);
  const out = {
    id: m.id,
    name: m.name,
    color: m.color,
    active: Boolean(m.active),
    removed: Boolean(m.removed_at),
    role: roleOf(m),
    ...eff,
    online: !m.removed_at && onlineIds.has(m.id),
    last_seen: m.last_seen,
    has_account: Boolean(m.password_hash),
  };
  if (viewer && (isAdmin(viewer) || viewer.id === m.id)) out.email = m.email;
  return out;
}

export function publicMe(m, nowIso) {
  return {
    id: m.id,
    name: m.name,
    color: m.color,
    email: m.email,
    role: roleOf(m),
    can: capabilities(m),
    must_change_password: Boolean(m.must_change_password),
    mail_approvals: Boolean(m.mail_approvals),
    mail_updates: Boolean(m.mail_updates),
    ...effectiveStatus(m, nowIso),
  };
}

export function listMembers(db, ctx) {
  return db.prepare(`SELECT ${COLS} FROM members ORDER BY id`).all().map((m) => publicMember(m, ctx));
}

const countAdmins = (db, exceptId = 0) =>
  db.prepare(`SELECT COUNT(*) AS n FROM members WHERE role = 'admin' AND removed_at IS NULL AND password_hash IS NOT NULL AND id != ?`).get(exceptId).n;

function wrapEmailConflict(fn) {
  try { return fn(); } catch (err) {
    if (/UNIQUE constraint failed: .*email|members_email/i.test(String(err?.message))) throw conflict('Já existe uma pessoa com este email.');
    throw err;
  }
}

// ---------- criar ----------

export async function createMember(db, input, { nowIso, actor }) {
  const allowed = rolesCreatableBy(actor);
  if (!allowed.length) throw forbidden('Só comandantes e administradores podem adicionar pessoas.');
  const name = text(input.name, 'O nome', { max: 60, required: true });
  const mail = email(input.email);
  const wanted = input.role ?? 'member';
  const { role, func } = splitRole(wanted);
  if (!allowed.includes(wanted)) throw forbidden('Só um administrador pode dar esta função.');
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM members WHERE removed_at IS NULL').get();
  if (n >= MAX_PEOPLE) throw bad(`Limite de ${MAX_PEOPLE} pessoas atingido.`);
  const col = input.color ? color(input.color) : COLORS[n % COLORS.length];

  let temp = null;
  let password = input.password;
  if (password === undefined || password === '') { temp = randomPassword(); password = temp; } else checkPassword(password);
  const hash = await hashPassword(password);

  const memberId = wrapEmailConflict(() => Number(
    db.prepare(
      `INSERT INTO members (name, color, role, func, email, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(name, col, role, func, mail, hash, nowIso).lastInsertRowid,
  ));
  return { id: memberId, temp_password: temp };
}

// ---------- editar ----------

export function updateMember(db, mid, input, { actor }) {
  const m = liveMember(db, mid);
  const admin = isAdmin(actor);
  if (!admin && actor.id !== mid) throw forbidden('Só os administradores podem alterar outras pessoas.');
  if (!admin && (input.active !== undefined || input.role !== undefined || input.email !== undefined)) {
    throw forbidden('Só os administradores podem alterar a visibilidade, a função ou o email.');
  }

  const name = text(input.name, 'O nome', { max: 60 });
  if (name === '') throw bad('O nome é obrigatório.');
  const picked = input.role === undefined ? { role: m.role, func: m.func } : splitRole(input.role);
  const next = {
    name: name ?? m.name,
    color: input.color === undefined ? m.color : color(input.color),
    active: input.active === undefined ? m.active : bool(input.active),
    role: picked.role,
    func: picked.func,
    email: input.email === undefined ? m.email : email(input.email),
  };

  if (m.active && !next.active) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM members WHERE active = 1 AND removed_at IS NULL AND id != ?').get(mid);
    if (n === 0) throw bad('Tem de existir pelo menos uma pessoa visível no quadro.');
  }
  if (m.role === 'admin' && next.role !== 'admin' && countAdmins(db, mid) === 0) {
    throw bad('Tem de existir pelo menos um administrador.');
  }
  wrapEmailConflict(() => db.prepare('UPDATE members SET name = ?, color = ?, active = ?, role = ?, func = ?, email = ? WHERE id = ?')
    .run(next.name, next.color, next.active, next.role, next.func, next.email, mid));
}

/** O próprio: nome, cor, estado e preferências de email. */
export function updateProfile(db, mid, input, { nowIso }) {
  const m = liveMember(db, mid);
  const name = text(input.name, 'O nome', { max: 60 });
  if (name === '') throw bad('O nome é obrigatório.');

  let status = m.status;
  let status_text = m.status_text;
  let status_until = m.status_until;
  if (input.status !== undefined) {
    status = oneOf(input.status, STATUS_KEYS, 'Estado');
    if (input.status === 'available' && input.status_text === undefined) status_text = '';
    if (input.status_until === undefined) status_until = null; // mudar de estado sem prazo = sem prazo
  }
  if (input.status_text !== undefined) status_text = text(input.status_text, 'A mensagem de estado', { max: 80 });
  if (input.status_until !== undefined) {
    if (input.status_until === null || input.status_until === '') status_until = null;
    else {
      const t = typeof input.status_until === 'string' ? Date.parse(input.status_until) : NaN;
      if (Number.isNaN(t)) throw bad('O prazo do estado é inválido.');
      if (t <= Date.parse(nowIso)) throw bad('O prazo do estado já passou.');
      if (t > Date.parse(nowIso) + 8 * 24 * 3600_000) throw bad('O prazo do estado não pode passar de uma semana.');
      status_until = new Date(t).toISOString();
    }
  }
  if (status === 'available') status_until = null;

  db.prepare(
    `UPDATE members SET name = ?, color = ?, status = ?, status_text = ?, status_until = ?, mail_approvals = ?, mail_updates = ? WHERE id = ?`,
  ).run(
    name ?? m.name,
    input.color === undefined ? m.color : color(input.color),
    status, status_text, status_until,
    input.mail_approvals === undefined ? m.mail_approvals : bool(input.mail_approvals),
    input.mail_updates === undefined ? m.mail_updates : bool(input.mail_updates),
    mid,
  );
}

// ---------- palavras-passe ----------

export async function changePassword(db, mid, input, { keepTokenHash = null } = {}) {
  const m = liveMember(db, mid);
  if (!(await verifyPassword(input.current, m.password_hash))) throw new HttpError(400, 'A palavra-passe atual está errada.');
  checkPassword(input.next, 'A nova palavra-passe');
  if (input.next === input.current) throw bad('A nova palavra-passe tem de ser diferente da atual.');
  const hash = await hashPassword(input.next);
  tx(db, () => {
    db.prepare('UPDATE members SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, mid);
    db.prepare('DELETE FROM sessions WHERE member_id = ? AND token_hash != ?').run(mid, keepTokenHash ?? '');
  });
}

export async function resetPassword(db, mid, { actor }) {
  liveMember(db, mid);
  if (mid === actor.id) throw bad('Para mudares a tua palavra-passe usa o teu perfil.');
  const temp = randomPassword();
  const hash = await hashPassword(temp);
  tx(db, () => {
    db.prepare('UPDATE members SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, mid);
    db.prepare('DELETE FROM sessions WHERE member_id = ?').run(mid);
  });
  return { temp_password: temp };
}

// ---------- remover ----------

/**
 * Só administradores. A pessoa deixa de poder entrar e sai do quadro, mas o que concluiu
 * continua no histórico. As tarefas em aberto passam para outra pessoa (ou são apagadas).
 */
export function removeMember(db, mid, input, { actor, nowIso, fx }) {
  const m = liveMember(db, mid);
  if (mid === actor.id) throw bad('Não podes remover a tua própria conta.');
  if (m.role === 'admin' && countAdmins(db, mid) === 0) throw bad('Tem de existir pelo menos um administrador.');

  const open = db.prepare(`SELECT id FROM tasks WHERE member_id = ? AND status != 'done'`).all(mid);
  const reassignTo = input.reassign_to === undefined || input.reassign_to === null || input.reassign_to === '' ? null : id(input.reassign_to, 'Pessoa');
  if (open.length && !reassignTo && !input.discard_open) {
    throw conflict(`${m.name} tem ${open.length} ${open.length === 1 ? 'tarefa em aberto' : 'tarefas em aberto'}. Escolhe quem as recebe.`, { open_tasks: open.length });
  }
  let target = null;
  if (reassignTo) {
    if (reassignTo === mid) throw bad('Escolhe outra pessoa para receber as tarefas.');
    target = liveMember(db, reassignTo);
  }

  tx(db, () => {
    if (target) {
      for (const t of open) {
        db.prepare('UPDATE tasks SET member_id = ? WHERE id = ?').run(target.id, t.id);
        logEvent(db, { task_id: t.id, member_id: actor.id, type: 'assigned', text: `${m.name} → ${target.name} (pessoa removida)`, meta: { from: mid, to: target.id }, nowIso });
      }
      db.prepare('UPDATE recurring SET member_id = ? WHERE member_id = ?').run(target.id, mid);
      if (open.length) {
        fx?.notify({
          to: target.id, actor: actor.id, type: 'assigned',
          text: `${actor.name} passou-te ${open.length} ${open.length === 1 ? 'tarefa' : 'tarefas'} de ${m.name}.`,
        });
      }
    } else {
      db.prepare(`DELETE FROM tasks WHERE member_id = ? AND status != 'done'`).run(mid);
      db.prepare('UPDATE recurring SET active = 0 WHERE member_id = ?').run(mid);
    }
    db.prepare(`UPDATE approvals SET status = 'cancelled', decided_at = ? WHERE status = 'pending' AND (approver_id = ? OR requested_by = ?)`)
      .run(nowIso, mid, mid);
    db.prepare('DELETE FROM sessions WHERE member_id = ?').run(mid);
    db.prepare('DELETE FROM notifications WHERE member_id = ?').run(mid);
    db.prepare('DELETE FROM meeting_attendees WHERE member_id = ?').run(mid);
    db.prepare('DELETE FROM direct_messages WHERE from_id = ? OR to_id = ?').run(mid, mid); // as conversas privadas não ficam órfãs no servidor
    db.prepare(
      `UPDATE members SET removed_at = ?, active = 0, role = 'member', func = 'member', email = NULL, password_hash = NULL, must_change_password = 0 WHERE id = ?`,
    ).run(nowIso, mid);
  });
}
