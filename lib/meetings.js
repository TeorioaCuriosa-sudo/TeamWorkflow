// Reuniões do calendário: data, hora, participantes e o link da videochamada (Meet, Teams, Zoom…).
// Toda a gente vê todas as reuniões e pode marcar uma; só quem a marcou (ou um administrador) a altera ou cancela.
import { tx } from './db.js';
import { isDate } from './dates.js';
import { isAdmin } from './perms.js';
import { bad, forbidden, idList, notFound, text } from './validate.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayLabel = (date) =>
  new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/** Aceita "meet.google.com/abc" (acrescenta https://) e recusa tudo o que não seja http(s). */
export function meetingLink(value) {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (typeof value !== 'string') throw bad('O link é inválido.');
  let s = value.trim();
  if (!s) return '';
  if (s.length > 500) throw bad('O link é demasiado longo.');
  if (/\s/.test(s)) throw bad('O link não pode ter espaços.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let url;
  try {
    url = new URL(s);
  } catch {
    throw bad('O link é inválido.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw bad('O link tem de começar por https://');
  if (!url.hostname.includes('.')) throw bad('O link é inválido.');
  return url.href;
}

/** O nome do serviço, para a interface e os emails (null se não for um dos conhecidos). */
export function linkProvider(link) {
  try {
    const host = new URL(link).hostname.toLowerCase();
    if (host === 'meet.google.com') return 'Google Meet';
    if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'Microsoft Teams';
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'Zoom';
    if (host === 'meet.jit.si' || host.startsWith('jitsi.') || host.startsWith('meet.')) return 'Jitsi';
  } catch { /* link inválido */ }
  return null;
}

function attendeeIds(db, mid) {
  return db
    .prepare(
      `SELECT a.member_id FROM meeting_attendees a JOIN members m ON m.id = a.member_id
       WHERE a.meeting_id = ? AND m.removed_at IS NULL ORDER BY a.member_id`,
    )
    .all(mid)
    .map((r) => r.member_id);
}

const present = (db, row) => ({ ...row, attendee_ids: attendeeIds(db, row.id) });

export function listMeetings(db) {
  return db.prepare('SELECT * FROM meetings ORDER BY date, start_time, id').all().map((r) => present(db, r));
}

const getRow = (db, mid) => {
  const row = db.prepare('SELECT * FROM meetings WHERE id = ?').get(mid);
  if (!row) throw notFound('Reunião não encontrada.');
  return row;
};

function fields(input, existing = {}) {
  const title = text(input.title, 'O título', { max: 120, required: existing.title === undefined }) ?? existing.title;
  if (!title) throw bad('O título é obrigatório.');
  const date = input.date === undefined ? existing.date : input.date;
  if (!isDate(date)) throw bad('Data inválida.');
  const start_time = input.start_time === undefined ? existing.start_time : input.start_time;
  const end_time = input.end_time === undefined ? existing.end_time : input.end_time;
  if (!TIME.test(start_time ?? '')) throw bad('Hora de início inválida.');
  if (!TIME.test(end_time ?? '')) throw bad('Hora de fim inválida.');
  if (end_time <= start_time) throw bad('A reunião tem de acabar depois de começar.');
  const link = meetingLink(input.link) ?? existing.link ?? '';
  const notes = text(input.notes, 'As notas', { max: 1000 }) ?? existing.notes ?? '';
  return { title, date, start_time, end_time, link, notes };
}

/** Só participantes que existem e estão ativos; quem marca a reunião fica sempre incluído. */
function resolveAttendees(db, requested, organiser) {
  const wanted = new Set(requested ?? []);
  if (organiser) wanted.add(organiser);
  const live = db.prepare('SELECT id FROM members WHERE id = ? AND removed_at IS NULL AND active = 1');
  const ok = [...wanted].filter((mid) => live.get(mid));
  if (requested?.some((mid) => !ok.includes(mid))) throw bad('Há participantes que já não estão na equipa.');
  return ok;
}

function mailFor(actor, m, subject, verb) {
  const provider = linkProvider(m.link);
  return {
    kind: 'update',
    subject: `${subject}: ${m.title}`,
    lines: [
      `${actor.name} ${verb} “${m.title}”.`,
      `Quando: ${dayLabel(m.date)}, das ${m.start_time} às ${m.end_time}.`,
      ...(m.link ? [`${provider ?? 'Videochamada'}: ${m.link}`] : []),
    ],
    cta: 'Abrir no calendário',
  };
}

export function createMeeting(db, input, { nowIso, actor, fx }) {
  const f = fields(input);
  const requested = idList(input.attendee_ids, 'Participantes', 60);
  const mid = tx(db, () => {
    const res = db
      .prepare('INSERT INTO meetings (title, date, start_time, end_time, link, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(f.title, f.date, f.start_time, f.end_time, f.link, f.notes, actor.id, nowIso);
    const newId = Number(res.lastInsertRowid);
    const ins = db.prepare('INSERT INTO meeting_attendees (meeting_id, member_id) VALUES (?, ?)');
    const people = resolveAttendees(db, requested, actor.id);
    for (const p of people) ins.run(newId, p);
    for (const p of people) {
      fx?.notify({
        to: p, actor: actor.id, type: 'meeting', meeting_id: newId,
        text: `${actor.name} convidou-te para “${f.title}”, ${dayLabel(f.date)} às ${f.start_time}.`,
        mail: mailFor(actor, f, 'Reunião', 'convidou-te para a reunião'),
      });
    }
    return newId;
  });
  return present(db, getRow(db, mid));
}

const canChange = (row, actor) => isAdmin(actor) || row.created_by === actor.id;
const NOT_ORGANISER = 'Só quem marcou a reunião (ou um administrador) a pode alterar.';

export function updateMeeting(db, mid, input, { nowIso, actor, fx }) {
  const existing = getRow(db, mid);
  if (!canChange(existing, actor)) throw forbidden(NOT_ORGANISER);
  const f = fields(input, existing);
  const requested = idList(input.attendee_ids, 'Participantes', 60);
  tx(db, () => {
    const before = new Set(attendeeIds(db, mid));
    db.prepare('UPDATE meetings SET title = ?, date = ?, start_time = ?, end_time = ?, link = ?, notes = ? WHERE id = ?')
      .run(f.title, f.date, f.start_time, f.end_time, f.link, f.notes, mid);
    let after = before;
    if (requested) {
      const next = resolveAttendees(db, requested, existing.created_by);
      after = new Set(next);
      db.prepare('DELETE FROM meeting_attendees WHERE meeting_id = ?').run(mid);
      const ins = db.prepare('INSERT INTO meeting_attendees (meeting_id, member_id) VALUES (?, ?)');
      for (const p of next) ins.run(mid, p);
    }
    const changed = ['title', 'date', 'start_time', 'end_time', 'link'].some((k) => existing[k] !== f[k]);
    for (const p of after) {
      if (!before.has(p)) {
        fx?.notify({
          to: p, actor: actor.id, type: 'meeting', meeting_id: mid,
          text: `${actor.name} convidou-te para “${f.title}”, ${dayLabel(f.date)} às ${f.start_time}.`,
          mail: mailFor(actor, f, 'Reunião', 'convidou-te para a reunião'),
        });
      } else if (changed) {
        fx?.notify({
          to: p, actor: actor.id, type: 'meeting', meeting_id: mid,
          text: `${actor.name} alterou a reunião “${f.title}”: ${dayLabel(f.date)}, ${f.start_time}–${f.end_time}.`,
          mail: mailFor(actor, f, 'Reunião alterada', 'alterou a reunião'),
        });
      }
    }
    for (const p of before) {
      if (!after.has(p)) {
        fx?.notify({ to: p, actor: actor.id, type: 'meeting', text: `${actor.name} retirou-te da reunião “${f.title}”.` });
      }
    }
  });
  return present(db, getRow(db, mid));
}

export function deleteMeeting(db, mid, { actor, fx }) {
  const existing = getRow(db, mid);
  if (!canChange(existing, actor)) throw forbidden('Só quem marcou a reunião (ou um administrador) a pode cancelar.');
  tx(db, () => {
    const people = attendeeIds(db, mid);
    db.prepare('DELETE FROM meetings WHERE id = ?').run(mid);
    for (const p of people) {
      fx?.notify({
        to: p, actor: actor.id, type: 'meeting',
        text: `${actor.name} cancelou a reunião “${existing.title}” (${dayLabel(existing.date)}, ${existing.start_time}).`,
        mail: { kind: 'update', subject: `Reunião cancelada: ${existing.title}`, lines: [`${actor.name} cancelou a reunião “${existing.title}” de ${dayLabel(existing.date)}, às ${existing.start_time}.`] },
      });
    }
  });
}
