// Camada de dados da plataforma: tarefas, recorrentes, pessoas, ausências e a renovação mensal.
//
// Neste momento os dados ficam no browser (localStorage). A interface só fala com `store.handle(método, caminho, corpo)`,
// por isso, se mais tarde for preciso partilhar os dados entre a equipa (Supabase, Firebase, uma API própria…),
// basta trocar a forma como `load()` e `save()` funcionam, ou fazer `handle` chamar um servidor. O ecrã não muda.

import { todayIn, monthOf, addDays, isDate, isMonth } from './dates.js';

export const COLORS = ['#2f6fed', '#e0662b', '#1f9d7a', '#a855c7', '#d6336c', '#b8860b', '#5b6b7c', '#c0392b'];
export const STORAGE_KEY = 'teamworkflow.v1';

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new StoreError(400, msg);
const notFound = (msg) => new StoreError(404, msg);

const KINDS = ['monthly', 'flex'];
const STATUSES = ['todo', 'doing', 'done'];
const ABSENCE_TYPES = ['ferias', 'ausencia', 'formacao'];

// ---------- validação ----------

function text(value, label, { max, required = false } = {}) {
  if (value === undefined) {
    if (required) throw bad(`${label} é obrigatório.`);
    return undefined;
  }
  if (typeof value !== 'string') throw bad(`${label} é inválido.`);
  const s = value.trim();
  if (required && !s) throw bad(`${label} é obrigatório.`);
  if (s.length > max) throw bad(`${label} é demasiado longo (máximo ${max} caracteres).`);
  return s;
}
function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw bad(`${label} inválido.`);
  return value;
}
function optionalDate(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!isDate(value)) throw bad(`${label} inválida.`);
  return value;
}
function id(value, label = 'Identificador') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw bad(`${label} inválido.`);
  return n;
}
function color(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw bad('Cor inválida.');
  return value.toLowerCase();
}

// ---------- modelo ----------

export function emptyDb() {
  const db = { v: 1, seq: 0, members: [], recurring: [], tasks: [], absences: [], months: [] };
  ['Pessoa 1', 'Pessoa 2', 'Pessoa 3'].forEach((name, i) => {
    db.members.push({ id: ++db.seq, name, color: COLORS[i], active: true });
  });
  return db;
}

export const columnOf = (t) => (t.status === 'doing' ? 'doing' : t.status === 'done' ? 'done' : t.kind === 'monthly' ? 'monthly' : 'flex');
const nextPosition = (db) => db.tasks.reduce((m, t) => Math.max(m, t.position), 0) + 1;

/**
 * Renovação mensal. Corre uma só vez por mês (a lista `months` serve de trinco):
 *  1. as tarefas semanais/diárias por concluir e tudo o que estava em progresso transitam para o mês novo;
 *  2. as tarefas mensais por concluir ficam no mês antigo (aparecem como "não concluídas" no histórico);
 *  3. cada tarefa recorrente ativa gera a sua cópia do mês novo (exceto se já existir uma transitada).
 */
export function ensureMonth(db, month, nowIso) {
  if (db.months.includes(month)) return false;
  db.months.push(month);
  for (const t of db.tasks) {
    if (t.month < month && t.status !== 'done' && (t.kind === 'flex' || t.status === 'doing')) t.month = month;
  }
  const activeIds = new Set(db.members.filter((m) => m.active).map((m) => m.id));
  const templates = db.recurring
    .filter((r) => r.active && activeIds.has(r.member_id))
    .sort((a, b) => a.member_id - b.member_id || a.position - b.position || a.id - b.id);
  let pos = nextPosition(db) - 1;
  for (const r of templates) {
    if (db.tasks.some((t) => t.recurring_id === r.id && t.month === month)) continue;
    pos += 1;
    db.tasks.push(newTask(db, { member_id: r.member_id, title: r.title, notes: r.notes, kind: 'monthly', status: 'todo', recurring_id: r.id }, month, nowIso, pos));
  }
  return true;
}

function newTask(db, f, month, nowIso, position) {
  const status = f.status || 'todo';
  return {
    id: ++db.seq,
    member_id: f.member_id,
    title: f.title,
    notes: f.notes || '',
    kind: f.kind || 'flex',
    status,
    month,
    origin_month: month,
    due: f.due || null,
    recurring_id: f.recurring_id || null,
    position,
    created_at: nowIso,
    started_at: status !== 'todo' ? nowIso : null,
    done_at: status === 'done' ? nowIso : null,
  };
}

// ---------- dados de exemplo ----------

export function demoDb(today, nowIso) {
  const db = { v: 1, seq: 0, members: [], recurring: [], tasks: [], absences: [], months: [] };
  const month = monthOf(today);
  const addM = (m, n) => { const [y, mo] = m.split('-').map(Number); const i = y * 12 + mo - 1 + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
  const prev = addM(month, -1);
  const prev2 = addM(month, -2);
  const ids = [['Ana', COLORS[0]], ['Bruno', COLORS[1]], ['Carla', COLORS[2]]].map(([name, c]) => {
    const m = { id: ++db.seq, name, color: c, active: true };
    db.members.push(m);
    return m.id;
  });
  const recs = [
    [ids[0], 'Relatório mensal de resultados', 'Enviar à direção até dia 5.'],
    [ids[0], 'Atualizar o dashboard de indicadores', ''],
    [ids[1], 'Fecho de faturação do mês', ''],
    [ids[1], 'Reconciliação de pagamentos', ''],
    [ids[2], 'Backup e atualizações do servidor', 'Confirmar que o backup foi restaurável.'],
    [ids[2], 'Revisão de acessos da equipa', ''],
  ].map(([member_id, title, notes], i) => {
    const r = { id: ++db.seq, member_id, title, notes, active: true, position: i };
    db.recurring.push(r);
    return r;
  });
  let pos = 0;
  const stamp = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
  for (const [m, ndone] of [[prev2, 6], [prev, 5]]) {
    db.months.push(m);
    recs.forEach((r, i) => {
      const t = newTask(db, { member_id: r.member_id, title: r.title, notes: r.notes, kind: 'monthly', status: i < ndone ? 'done' : 'todo', recurring_id: r.id }, m, stamp(`${m}-01`, 8), ++pos);
      if (i < ndone) { t.started_at = stamp(`${m}-0${2 + (i % 6)}`); t.done_at = stamp(`${m}-1${i % 8}`); }
      db.tasks.push(t);
    });
    [[ids[0], 'Preparar proposta para novo cliente'], [ids[1], 'Corrigir exportação de contratos'], [ids[2], 'Migrar formulário de contacto'], [ids[1], 'Formação interna sobre RGPD']].forEach(([mid, title]) => {
      const t = newTask(db, { member_id: mid, title, kind: 'flex', status: 'done' }, m, stamp(`${m}-03`), ++pos);
      t.done_at = stamp(`${m}-2${pos % 8}`);
      db.tasks.push(t);
    });
  }
  db.months.push(month);
  recs.forEach((r, i) => {
    const status = i === 0 ? 'done' : i === 2 ? 'doing' : 'todo';
    db.tasks.push(newTask(db, { member_id: r.member_id, title: r.title, notes: r.notes, kind: 'monthly', status, recurring_id: r.id }, month, nowIso, ++pos));
  });
  const day = (n) => addDays(today, n);
  [
    [ids[0], 'Responder ao pedido do cliente sobre o portal', 'todo', day(2)],
    [ids[0], 'Rever copy da landing page', 'doing', day(1)],
    [ids[0], 'Atualizar documentação do fluxo de pedidos', 'done', null],
    [ids[1], 'Corrigir validação do formulário de simulação', 'doing', day(-1)],
    [ids[1], 'Agendar reunião de balanço trimestral', 'todo', day(5)],
    [ids[1], 'Enviar contratos pendentes para assinatura', 'done', null],
    [ids[2], 'Configurar monitorização do servidor', 'doing', null],
    [ids[2], 'Testar restauro da base de dados', 'todo', day(3)],
    [ids[2], 'Atualizar certificados do subdomínio', 'done', null],
  ].forEach(([mid, title, status, due]) => {
    db.tasks.push(newTask(db, { member_id: mid, title, kind: 'flex', status, due }, month, nowIso, ++pos));
  });
  const abs = (member_id, start_date, end_date, type, note) => db.absences.push({ id: ++db.seq, member_id, start_date, end_date, type, note });
  abs(ids[2], day(-1), day(3), 'ferias', '');
  abs(ids[1], day(9), day(20), 'ferias', 'Viagem em família');
  abs(ids[0], day(14), day(14), 'formacao', 'Formação Salesforce');
  return db;
}

// ---------- importação ----------

function validateImport(data) {
  const fail = () => { throw bad('Ficheiro inválido: não parece uma cópia de segurança do TeamWorkflow.'); };
  if (!data || typeof data !== 'object' || data.v !== 1) fail();
  for (const k of ['members', 'recurring', 'tasks', 'absences', 'months']) if (!Array.isArray(data[k])) fail();
  if (!data.members.length) fail();
  const memberIds = new Set();
  for (const m of data.members) {
    if (!Number.isInteger(m.id) || typeof m.name !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(m.color || '')) fail();
    memberIds.add(m.id);
  }
  for (const r of data.recurring) {
    if (!Number.isInteger(r.id) || !memberIds.has(r.member_id) || typeof r.title !== 'string') fail();
  }
  for (const t of data.tasks) {
    if (!Number.isInteger(t.id) || !memberIds.has(t.member_id) || typeof t.title !== 'string'
      || !KINDS.includes(t.kind) || !STATUSES.includes(t.status) || !isMonth(t.month) || !isMonth(t.origin_month)
      || typeof t.position !== 'number') fail();
  }
  for (const a of data.absences) {
    if (!Number.isInteger(a.id) || !memberIds.has(a.member_id) || !isDate(a.start_date) || !isDate(a.end_date) || !ABSENCE_TYPES.includes(a.type)) fail();
  }
  if (!data.months.every(isMonth)) fail();
  const clean = {
    v: 1, seq: 0,
    members: data.members.map((m) => ({ id: m.id, name: String(m.name).slice(0, 60), color: m.color.toLowerCase(), active: m.active !== false })),
    recurring: data.recurring.map((r) => ({ id: r.id, member_id: r.member_id, title: String(r.title).slice(0, 200), notes: String(r.notes || '').slice(0, 2000), active: r.active !== false, position: Number(r.position) || 0 })),
    tasks: data.tasks.map((t) => ({
      id: t.id, member_id: t.member_id, title: String(t.title).slice(0, 200), notes: String(t.notes || '').slice(0, 2000), kind: t.kind, status: t.status,
      month: t.month, origin_month: t.origin_month, due: isDate(t.due) ? t.due : null, recurring_id: Number.isInteger(t.recurring_id) ? t.recurring_id : null,
      position: t.position, created_at: String(t.created_at || ''), started_at: t.started_at || null, done_at: t.done_at || null,
    })),
    absences: data.absences.map((a) => ({ id: a.id, member_id: a.member_id, start_date: a.start_date, end_date: a.end_date, type: a.type, note: String(a.note || '').slice(0, 200) })),
    months: [...new Set(data.months)],
  };
  clean.seq = Math.max(0, ...clean.members.map((x) => x.id), ...clean.recurring.map((x) => x.id), ...clean.tasks.map((x) => x.id), ...clean.absences.map((x) => x.id));
  return clean;
}

// ---------- exportação ----------

const STATUS_PT = { todo: 'Por fazer', doing: 'Em progresso', done: 'Concluída' };
const KIND_PT = { monthly: 'Mensal', flex: 'Semanal/diária' };
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita execução de fórmulas no Excel
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- a loja ----------

export function createStore({ storage, now = () => new Date(), config = {} }) {
  const tz = config.timezone || 'Europe/Lisbon';
  const extraHolidays = (config.extraHolidays || []).filter(isDate);
  const today = () => todayIn(tz, now());
  const nowIso = () => now().toISOString();

  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyDb();
    try {
      const db = JSON.parse(raw);
      for (const k of ['members', 'recurring', 'tasks', 'absences', 'months']) if (!Array.isArray(db[k])) throw new Error('forma');
      return db;
    } catch {
      // Dados ilegíveis: guarda uma cópia do que lá estava e recomeça, em vez de deixar a plataforma presa.
      storage.setItem(`${STORAGE_KEY}.corrompido`, raw);
      return emptyDb();
    }
  }
  const save = (db) => storage.setItem(STORAGE_KEY, JSON.stringify(db));

  // ----- operações -----

  const getState = (db, { month }) => {
    const cm = monthOf(today());
    return {
      today: today(),
      currentMonth: cm,
      month,
      archived: month !== cm,
      members: db.members,
      recurring: [...db.recurring].sort((a, b) => a.member_id - b.member_id || a.position - b.position || a.id - b.id),
      tasks: db.tasks.filter((t) => t.month === month).sort((a, b) => a.position - b.position || a.id - b.id),
      absences: [...db.absences].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date) || a.id - b.id),
      extraHolidays,
      palette: COLORS,
    };
  };

  const getHistory = (db) => {
    const cm = monthOf(today());
    const byMonth = new Map();
    const entry = (m) => {
      if (!byMonth.has(m)) byMonth.set(m, { month: m, total: 0, done: 0, carried: 0, members: [] });
      return byMonth.get(m);
    };
    entry(cm);
    const per = new Map();
    for (const t of db.tasks) {
      const e = entry(t.month);
      e.total += 1;
      if (t.status === 'done') e.done += 1;
      if (t.origin_month !== t.month) e.carried += 1;
      const key = `${t.month}|${t.member_id}`;
      if (!per.has(key)) { const mm = { member_id: t.member_id, total: 0, done: 0 }; per.set(key, mm); e.members.push(mm); }
      const mm = per.get(key);
      mm.total += 1;
      if (t.status === 'done') mm.done += 1;
    }
    return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  };

  function requireMember(db, memberId) {
    const m = db.members.find((x) => x.id === memberId);
    if (!m) throw bad('Pessoa inexistente.');
    return m;
  }

  function createTask(db, input) {
    const title = text(input.title, 'O título', { max: 200, required: true });
    const notes = text(input.notes, 'As notas', { max: 2000 }) ?? '';
    const member_id = id(input.member_id, 'Pessoa');
    requireMember(db, member_id);
    const kind = oneOf(input.kind ?? 'flex', KINDS, 'Tipo');
    const status = oneOf(input.status ?? 'todo', STATUSES, 'Estado');
    const due = optionalDate(input.due, 'Data') ?? null;
    const month = monthOf(today());
    let recurring_id = null;
    if (input.repeat && kind === 'monthly') {
      const r = { id: ++db.seq, member_id, title, notes, active: true, position: nextPosition(db) };
      db.recurring.push(r);
      recurring_id = r.id;
    }
    const t = newTask(db, { member_id, title, notes, kind, status, due, recurring_id }, month, nowIso(), nextPosition(db));
    db.tasks.push(t);
    return t;
  }

  function updateTask(db, taskId, input) {
    const t = db.tasks.find((x) => x.id === taskId);
    if (!t) throw notFound('Tarefa não encontrada.');
    const next = { ...t };
    const title = text(input.title, 'O título', { max: 200 });
    if (title !== undefined) {
      if (!title) throw bad('O título é obrigatório.');
      next.title = title;
    }
    const notes = text(input.notes, 'As notas', { max: 2000 });
    if (notes !== undefined) next.notes = notes;
    if (input.member_id !== undefined) {
      next.member_id = id(input.member_id, 'Pessoa');
      requireMember(db, next.member_id);
    }
    if (input.kind !== undefined) next.kind = oneOf(input.kind, KINDS, 'Tipo');
    if (input.status !== undefined) next.status = oneOf(input.status, STATUSES, 'Estado');
    const due = optionalDate(input.due, 'Data');
    if (due !== undefined) next.due = due;

    if (next.status !== t.status) {
      if (next.status === 'doing') next.started_at = t.started_at ?? nowIso();
      if (next.status === 'done') {
        next.started_at = t.started_at ?? nowIso();
        next.done_at = nowIso();
      } else {
        next.done_at = null;
      }
      if (next.status === 'todo') next.started_at = null;
    }
    if (next.kind === 'flex') next.recurring_id = null; // deixa de ser cópia de uma recorrente

    const movedColumn = columnOf(next) !== columnOf(t) || next.member_id !== t.member_id;
    const wantsEnd = movedColumn || input.to_end;
    if (input.before_id !== undefined && input.before_id !== null) {
      const beforeId = id(input.before_id, 'Posição');
      const before = db.tasks.find((x) => x.id === beforeId && x.month === t.month);
      if (before && before.id !== t.id) {
        const col = columnOf(next);
        const prev = db.tasks
          .filter((x) => x.month === t.month && x.member_id === next.member_id && x.id !== t.id && x.position < before.position && columnOf(x) === col)
          .sort((a, b) => b.position - a.position)[0];
        next.position = prev ? (prev.position + before.position) / 2 : before.position - 1;
      } else if (wantsEnd) {
        next.position = nextPosition(db);
      }
    } else if (wantsEnd) {
      next.position = nextPosition(db);
    }
    Object.assign(t, next);
    return t;
  }

  function deleteTask(db, taskId) {
    const i = db.tasks.findIndex((x) => x.id === taskId);
    if (i < 0) throw notFound('Tarefa não encontrada.');
    db.tasks.splice(i, 1);
  }

  function createRecurring(db, input) {
    const title = text(input.title, 'O título', { max: 200, required: true });
    const notes = text(input.notes, 'As notas', { max: 2000 }) ?? '';
    const member_id = id(input.member_id, 'Pessoa');
    requireMember(db, member_id);
    const r = { id: ++db.seq, member_id, title, notes, active: true, position: nextPosition(db) };
    db.recurring.push(r);
    // Aparece já neste mês, sem esperar pela próxima renovação.
    db.tasks.push(newTask(db, { member_id, title, notes, kind: 'monthly', status: 'todo', recurring_id: r.id }, monthOf(today()), nowIso(), nextPosition(db)));
    return r;
  }

  function updateRecurring(db, rid, input) {
    const r = db.recurring.find((x) => x.id === rid);
    if (!r) throw notFound('Tarefa recorrente não encontrada.');
    const title = text(input.title, 'O título', { max: 200 });
    if (title === '') throw bad('O título é obrigatório.');
    const notes = text(input.notes, 'As notas', { max: 2000 });
    if (input.member_id !== undefined) {
      r.member_id = id(input.member_id, 'Pessoa');
      requireMember(db, r.member_id);
    }
    if (title !== undefined) r.title = title;
    if (notes !== undefined) r.notes = notes;
    if (input.active !== undefined) r.active = Boolean(input.active);
    return r;
  }

  /** Apaga o modelo. Só remove a cópia deste mês se ainda ninguém lhe tocou (por fazer). */
  function deleteRecurring(db, rid) {
    const i = db.recurring.findIndex((x) => x.id === rid);
    if (i < 0) throw notFound('Tarefa recorrente não encontrada.');
    const month = monthOf(today());
    db.tasks = db.tasks.filter((t) => !(t.recurring_id === rid && t.month === month && t.status === 'todo'));
    for (const t of db.tasks) if (t.recurring_id === rid) t.recurring_id = null;
    db.recurring.splice(i, 1);
  }

  function createMember(db, input) {
    const name = text(input.name, 'O nome', { max: 60, required: true });
    if (db.members.length >= 12) throw bad('Limite de 12 pessoas atingido.');
    const m = { id: ++db.seq, name, color: input.color ? color(input.color) : COLORS[db.members.length % COLORS.length], active: true };
    db.members.push(m);
    return m;
  }

  function updateMember(db, mid, input) {
    const m = db.members.find((x) => x.id === mid);
    if (!m) throw notFound('Pessoa não encontrada.');
    const name = text(input.name, 'O nome', { max: 60 });
    if (name === '') throw bad('O nome é obrigatório.');
    const active = input.active === undefined ? m.active : Boolean(input.active);
    if (m.active && !active && !db.members.some((x) => x.active && x.id !== mid)) throw bad('Tem de existir pelo menos uma pessoa ativa.');
    if (name !== undefined) m.name = name;
    if (input.color !== undefined) m.color = color(input.color);
    m.active = active;
    return m;
  }

  function absenceFields(input, existing = {}) {
    const member_id = input.member_id === undefined ? existing.member_id : id(input.member_id, 'Pessoa');
    if (member_id === undefined) throw bad('Pessoa é obrigatória.');
    const start_date = input.start_date === undefined ? existing.start_date : input.start_date;
    const end_date = input.end_date === undefined ? existing.end_date : input.end_date;
    if (!isDate(start_date)) throw bad('Data de início inválida.');
    if (!isDate(end_date)) throw bad('Data de fim inválida.');
    if (end_date < start_date) throw bad('A data de fim não pode ser anterior à de início.');
    const type = oneOf(input.type ?? existing.type ?? 'ferias', ABSENCE_TYPES, 'Tipo');
    const note = text(input.note, 'A nota', { max: 200 }) ?? existing.note ?? '';
    return { member_id, start_date, end_date, type, note };
  }

  function createAbsence(db, input) {
    const f = absenceFields(input);
    requireMember(db, f.member_id);
    const a = { id: ++db.seq, ...f };
    db.absences.push(a);
    return a;
  }

  function updateAbsence(db, aid, input) {
    const a = db.absences.find((x) => x.id === aid);
    if (!a) throw notFound('Ausência não encontrada.');
    const f = absenceFields(input, a);
    requireMember(db, f.member_id);
    Object.assign(a, f);
    return a;
  }

  function deleteAbsence(db, aid) {
    const i = db.absences.findIndex((x) => x.id === aid);
    if (i < 0) throw notFound('Ausência não encontrada.');
    db.absences.splice(i, 1);
  }

  function monthCsv(db, month) {
    const nameOf = (mid) => db.members.find((m) => m.id === mid)?.name ?? '';
    const rows = db.tasks
      .filter((t) => t.month === month)
      .sort((a, b) => a.member_id - b.member_id || (b.status === 'done') - (a.status === 'done') || a.position - b.position);
    const head = ['Mês', 'Pessoa', 'Tarefa', 'Tipo', 'Estado', 'Prazo', 'Criada em', 'Concluída em', 'Transitada de', 'Notas'];
    const lines = [head.map(csvCell).join(';')];
    for (const r of rows) {
      lines.push([
        r.month, nameOf(r.member_id), r.title, KIND_PT[r.kind], STATUS_PT[r.status], r.due ?? '',
        (r.created_at || '').slice(0, 10), r.done_at ? r.done_at.slice(0, 10) : '',
        r.origin_month !== r.month ? r.origin_month : '', r.notes,
      ].map(csvCell).join(';'));
    }
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  // ----- rotas (mesma forma que uma API REST, para poder ser trocada por um servidor no futuro) -----

  const routes = [];
  const add = (method, pattern, fn, write = false) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, fn, write });
  };
  const num = (v) => id(v);

  add('GET', '/api/state', (db, { query }) => {
    const cm = monthOf(today());
    let month = isMonth(query.month) ? query.month : cm;
    if (month > cm) month = cm;
    return getState(db, { month });
  });
  add('GET', '/api/history', (db) => getHistory(db));
  add('GET', '/api/export/:month', (db, { params }) => {
    const month = params.month.replace(/\.csv$/, '');
    if (!isMonth(month)) throw bad('Mês inválido.');
    return { filename: `tarefas-${month}.csv`, text: monthCsv(db, month) };
  });
  add('GET', '/api/backup', (db) => ({ filename: `teamworkflow-${today()}.json`, text: JSON.stringify({ ...db, exportedAt: nowIso() }, null, 2) }));

  add('POST', '/api/tasks', (db, { body }) => createTask(db, body), true);
  add('PATCH', '/api/tasks/:id', (db, { params, body }) => updateTask(db, num(params.id), body), true);
  add('DELETE', '/api/tasks/:id', (db, { params }) => deleteTask(db, num(params.id)), true);

  add('POST', '/api/recurring', (db, { body }) => createRecurring(db, body), true);
  add('PATCH', '/api/recurring/:id', (db, { params, body }) => updateRecurring(db, num(params.id), body), true);
  add('DELETE', '/api/recurring/:id', (db, { params }) => deleteRecurring(db, num(params.id)), true);

  add('POST', '/api/members', (db, { body }) => createMember(db, body), true);
  add('PATCH', '/api/members/:id', (db, { params, body }) => updateMember(db, num(params.id), body), true);

  add('POST', '/api/absences', (db, { body }) => createAbsence(db, body), true);
  add('PATCH', '/api/absences/:id', (db, { params, body }) => updateAbsence(db, num(params.id), body), true);
  add('DELETE', '/api/absences/:id', (db, { params }) => deleteAbsence(db, num(params.id)), true);

  const replaceDb = (db, next) => { for (const k of Object.keys(db)) delete db[k]; Object.assign(db, next); };
  add('POST', '/api/import', (db, { body }) => { replaceDb(db, validateImport(body.data)); }, true);
  add('POST', '/api/demo', (db) => { replaceDb(db, demoDb(today(), nowIso())); }, true);
  add('POST', '/api/reset', (db) => { replaceDb(db, emptyDb()); }, true);

  /** Ponto único de entrada. Devolve uma cópia dos dados (nunca referências internas). */
  async function handle(method, path, body = {}) {
    const url = new URL(path, 'http://local');
    const route = routes.find((r) => r.method === method && r.re.test(url.pathname));
    if (!route) throw new StoreError(404, 'Não encontrado.');
    const m = route.re.exec(url.pathname);
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const db = load();
    const created = ensureMonth(db, monthOf(today()), nowIso());
    const result = route.fn(db, { params, query: Object.fromEntries(url.searchParams), body: body || {} });
    if (route.write) {
      ensureMonth(db, monthOf(today()), nowIso()); // depois de importar ou repor, garante o mês atual aberto
      save(db);
    } else if (created) {
      save(db); // uma leitura pode ter aberto um mês novo
    }
    return result === undefined ? { ok: true } : JSON.parse(JSON.stringify(result));
  }

  return { handle, today, load, save };
}
