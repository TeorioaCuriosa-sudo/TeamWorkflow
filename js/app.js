import {
  h, icon, MONTHS, WEEKDAYS_SHORT, addDays, addMonths, daysInMonth, monthLabel, dayLabel, dayLabelYear, rangeLabel,
  dateTimeLabel, holidayName, isWorkday, workdaysBetween, weekday, initials, cap,
} from './util.js';
import { createStore, STORAGE_KEY } from './store.js';
import { CONFIG } from './config.js';

const TYPES = { ferias: 'Férias', ausencia: 'Ausência', formacao: 'Formação' };
const VIEWS = ['workflow', 'ausencias', 'historico', 'definicoes'];
const pad = (n) => String(n).padStart(2, '0');

const COLS = [
  { key: 'monthly', label: 'Mensais', patch: { status: 'todo', kind: 'monthly' } },
  { key: 'flex', label: 'Semanais / diárias', patch: { status: 'todo', kind: 'flex' } },
  { key: 'doing', label: 'Em progresso', patch: { status: 'doing' } },
  { key: 'done', label: 'Finalizadas', patch: { status: 'done' } },
];
const columnOf = (t) => (t.status === 'doing' ? 'doing' : t.status === 'done' ? 'done' : t.kind === 'monthly' ? 'monthly' : 'flex');

const S = {
  data: null,
  history: null,
  view: 'workflow',
  month: null, // null = mês atual
  absMonth: null,
  filter: Number(pref('filter')) || null,
  composer: null, // { memberId, col, repeat }
  dragId: null,
  volatile: false, // true quando o browser não deixa gravar
  token: 0,
};

function pref(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(`tw.${key}`);
    if (value === null) localStorage.removeItem(`tw.${key}`);
    else localStorage.setItem(`tw.${key}`, String(value));
  } catch { /* sem armazenamento local */ }
  return null;
}

// ---------- dados (guardados neste browser) ----------

function makeStorage() {
  try {
    localStorage.setItem('__tw_probe__', '1');
    localStorage.removeItem('__tw_probe__');
    return localStorage;
  } catch {
    // Sem armazenamento local (janela privada, por exemplo): guarda só em memória.
    S.volatile = true;
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
}
const store = createStore({ storage: makeStorage(), config: CONFIG });
const api = (method, path, body) => store.handle(method, path, body);

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadFrom(path, type) {
  try {
    const { filename, text } = await api('GET', path);
    download(filename, text, type);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('O ficheiro não é um JSON válido.', 'error'); return; }
  if (!confirm('Importar vai substituir TODOS os dados deste browser pelos do ficheiro. Continuar?')) return;
  try {
    await api('POST', '/api/import', { data });
    toast('Dados importados.');
  } catch (e) {
    toast(e.message, 'error');
  }
  await refresh();
}

function toast(message, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2600);
}

async function mutate(fn) {
  try {
    await fn();
  } catch (e) {
    toast(e.message, 'error');
  }
  await refresh();
}

// ---------- carregamento e sincronização ----------

async function refresh() {
  const token = ++S.token;
  try {
    const q = S.view === 'workflow' && S.month ? `?month=${S.month}` : '';
    const [data, history] = await Promise.all([
      api('GET', `/api/state${q}`),
      S.view === 'historico' ? api('GET', '/api/history') : Promise.resolve(S.history),
    ]);
    if (token !== S.token) return;
    S.data = data;
    S.history = history;
    if (S.view === 'workflow' && data.month === data.currentMonth) S.month = null;
    if (!S.absMonth) S.absMonth = data.currentMonth;
    renderApp();
  } catch (e) {
    if (token === S.token) toast(e.message, 'error');
  }
}

let refreshTimer = null;
let pendingRefresh = false;
const busy = () => {
  const a = document.activeElement;
  return Boolean(S.dragId) || document.getElementById('dialog').open || (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) && a.closest('#app'));
};
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (busy()) { pendingRefresh = true; return; }
    pendingRefresh = false;
    refresh();
  }, 200);
}
function flushPending() {
  if (pendingRefresh && !busy()) { pendingRefresh = false; refresh(); }
}
document.addEventListener('focusout', () => setTimeout(flushPending, 50));

// Outros separadores do mesmo browser: o localStorage avisa quando os dados mudam.
window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) scheduleRefresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
// Se a página ficar aberta durante a passagem de mês (ou de dia), atualiza sozinha.
setInterval(() => { if (S.data && store.today() !== S.data.today && !busy()) refresh(); }, 60_000);

// ---------- navegação ----------

function parseHash() {
  const [view, param] = location.hash.slice(1).split('/');
  S.view = VIEWS.includes(view) ? view : 'workflow';
  S.month = S.view === 'workflow' && /^\d{4}-(0[1-9]|1[0-2])$/.test(param || '') ? param : null;
}
window.addEventListener('hashchange', () => { parseHash(); S.composer = null; refresh(); });

// ---------- apresentação geral ----------

function renderApp() {
  const app = document.getElementById('app');
  if (!S.data) {
    app.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'muted' }, 'A carregar…')));
    return;
  }
  const scrollers = [...document.querySelectorAll('.tl-wrap')].map((e) => e.scrollLeft);
  const view = { workflow: viewWorkflow, ausencias: viewAbsences, historico: viewHistory, definicoes: viewSettings }[S.view]();
  app.replaceChildren(header(), view);
  document.querySelectorAll('.tl-wrap').forEach((e, i) => {
    if (scrollers[i]) { e.scrollLeft = scrollers[i]; return; }
    const today = e.querySelector('.tl-day.today'); // em ecrãs estreitos, abre já no dia de hoje
    if (today) e.scrollLeft = Math.max(0, today.getBoundingClientRect().left - e.getBoundingClientRect().left + e.scrollLeft - 150);
  });
  if (S.composer) document.querySelector('.composer input[type="text"]')?.focus();
  const monthTitle = S.view === 'workflow' ? cap(monthLabel(S.data.month)) : null;
  document.title = monthTitle ? `TeamWorkflow · ${monthTitle}` : 'TeamWorkflow';
}

function logo() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 9h5v14H9zM18 9h5v8h-5z" fill="var(--surface)"/><path d="M18 20h5v3h-5z" fill="#62cf95"/>';
  return svg;
}

function header() {
  const tab = (id, label) => h('a', { href: `#${id}`, 'aria-current': S.view === id ? 'page' : null }, label);
  const live = h('span', { class: `live ${S.volatile ? 'off' : 'on'}`, title: S.volatile ? 'Este browser não deixa gravar: os dados perdem-se ao fechar.' : 'Os dados ficam guardados neste browser.' }, h('i'), h('span', {}, S.volatile ? 'Sem gravação' : 'Guardado neste browser'));
  return h('header', { class: 'top' },
    h('div', { class: 'brand' }, logo(), h('span', {}, 'TeamWorkflow')),
    h('nav', { class: 'tabs', 'aria-label': 'Secções' }, tab('workflow', 'Workflow'), tab('ausencias', 'Ausências'), tab('historico', 'Histórico'), tab('definicoes', 'Definições')),
    h('div', { class: 'top-right' }, live),
  );
}

const activeMembers = () => S.data.members.filter((m) => m.active);
const memberOf = (id) => S.data.members.find((m) => m.id === id);
const mStyle = (m) => ({ '--m': m.color });
const avatar = (m) => h('span', { class: 'avatar', style: mStyle(m), 'aria-hidden': 'true' }, initials(m.name));

// ---------- vista: Workflow ----------

function nextWorkday(date) {
  let d = addDays(date, 1);
  for (let i = 0; i < 40 && !isWorkday(d, S.data.extraHolidays); i += 1) d = addDays(d, 1);
  return d;
}

function absenceNow(memberId) {
  const { today, absences } = S.data;
  return absences.find((a) => a.member_id === memberId && a.start_date <= today && a.end_date >= today);
}

function presenceStrip() {
  const { today, absences } = S.data;
  return h('section', { class: 'presence', 'aria-label': 'Quem está fora' },
    activeMembers().map((m) => {
      const now = absenceNow(m.id);
      const next = absences.filter((a) => a.member_id === m.id && a.start_date > today)[0];
      let state = 'Disponível';
      if (now) state = `${TYPES[now.type]} · volta a ${dayLabel(nextWorkday(now.end_date))}`;
      else if (next) state = `Disponível · ${TYPES[next.type].toLowerCase()} de ${rangeLabel(next.start_date, next.end_date)}`;
      return h('div', { class: `pres ${now ? 'away' : ''}`, style: mStyle(m), title: state },
        avatar(m),
        h('div', { class: 'txt' }, h('span', { class: 'who' }, m.name), h('span', { class: 'state' }, state)));
    }));
}

function viewWorkflow() {
  const d = S.data;
  const page = h('div', { class: 'page' });
  const cur = d.currentMonth;

  const go = (month) => { location.hash = month === cur ? '#workflow' : `#workflow/${month}`; };
  const nav = h('div', { class: 'month-nav' },
    h('button', { class: 'icon-btn', title: 'Mês anterior', 'aria-label': 'Mês anterior', onclick: () => go(addMonths(d.month, -1)) }, icon('left')),
    h('span', { class: 'label' }, cap(monthLabel(d.month))),
    h('button', { class: 'icon-btn', title: 'Mês seguinte', 'aria-label': 'Mês seguinte', disabled: d.month >= cur, onclick: () => go(addMonths(d.month, 1)) }, icon('right')));

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por pessoa' },
    h('button', { class: 'chip-btn', 'aria-pressed': String(!S.filter), onclick: () => setFilter(null) }, 'Equipa'),
    activeMembers().map((m) => h('button', { class: 'chip-btn', style: mStyle(m), 'aria-pressed': String(S.filter === m.id), onclick: () => setFilter(m.id) }, h('span', { class: 'dot' }), m.name)));

  page.append(h('div', { class: 'toolbar' }, nav, chips, h('span', { class: 'spacer' }),
    h('span', { class: 'muted num' }, `Hoje · ${WEEKDAYS_SHORT[weekday(d.today)]}, ${dayLabelYear(d.today)}`)));

  if (!d.archived && !d.tasks.length && !d.recurring.length) {
    page.append(h('div', { class: 'banner hint' },
      'Primeiros passos: dá os nomes à equipa e define as tarefas mensais recorrentes em Definições, ou carrega dados de exemplo para experimentar.',
      h('a', { class: 'btn small', href: '#definicoes' }, 'Abrir Definições')));
  }

  if (!d.archived) page.append(presenceStrip());
  else {
    page.append(h('div', { class: 'banner' }, `Arquivo de ${monthLabel(d.month)}. Só de leitura.`,
      h('button', { class: 'btn small', onclick: () => go(cur) }, 'Voltar ao mês atual')));
  }

  const lanes = h('div', { class: 'lanes' });
  const members = d.members.filter((m) => m.active || (d.archived && d.tasks.some((t) => t.member_id === m.id)))
    .filter((m) => !S.filter || m.id === S.filter || !d.members.some((x) => x.id === S.filter && x.active));
  for (const m of members) lanes.append(lane(m));
  page.append(lanes);
  return page;
}

function setFilter(id) {
  S.filter = id;
  pref('filter', id);
  renderApp();
}

function lane(m) {
  const d = S.data;
  const mine = d.tasks.filter((t) => t.member_id === m.id);
  const done = mine.filter((t) => t.status === 'done').length;
  const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
  const away = !d.archived && absenceNow(m.id);

  const head = h('div', { class: 'lane-head', style: mStyle(m) },
    avatar(m),
    h('span', { class: 'name' }, m.name),
    away && h('span', { class: 'away-tag' }, `${TYPES[away.type]} até ${dayLabel(away.end_date)}`),
    h('div', { class: 'progress' },
      h('span', { class: 'num' }, `${done} de ${mine.length} concluídas`),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${pct}% concluído`, style: { '--pct': `${pct}%` } }, h('i'))),
    !d.archived && h('button', { class: 'btn small', onclick: () => openTaskDialog(null, { memberId: m.id }) }, icon('plus'), 'Nova tarefa'));

  return h('section', { class: 'lane', style: mStyle(m), 'aria-label': `Tarefas de ${m.name}` }, head,
    h('div', { class: 'cols' }, COLS.map((c) => column(m, c, mine.filter((t) => columnOf(t) === c.key)))));
}

function column(m, col, tasks) {
  const d = S.data;
  const items = [...tasks];
  if (col.key === 'done') items.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const composing = S.composer && S.composer.memberId === m.id && S.composer.col === col.key;

  const body = h('div', { class: 'col-body' },
    composing && composer(m, col),
    items.map((t) => card(t)),
    !items.length && !composing && h('div', { class: 'empty' }, d.archived ? 'Nenhuma' : 'Sem tarefas'));

  const el = h('section', { class: 'col', dataset: { col: col.key, member: m.id } },
    h('div', { class: 'col-head' },
      h('span', { class: 'label' }, col.label),
      h('span', { class: 'count num' }, items.length),
      !d.archived && col.key !== 'done' && h('button', {
        class: 'icon-btn', title: `Adicionar a ${m.name}: ${col.label}`, 'aria-label': `Adicionar tarefa a ${m.name}: ${col.label}`,
        onclick: () => { S.composer = { memberId: m.id, col: col.key, repeat: true }; renderApp(); },
      }, icon('plus'))),
    body);
  if (!d.archived) wireDrop(el, body, m.id, col.key);
  return el;
}

function composer(m, col) {
  const input = h('input', {
    type: 'text', maxlength: 200, autocomplete: 'off', 'aria-label': 'Título da nova tarefa',
    placeholder: col.key === 'monthly' ? 'Nova tarefa mensal…' : col.key === 'doing' ? 'O que estás a fazer?…' : 'Nova tarefa…',
    onkeydown: (e) => { if (e.key === 'Escape') { S.composer = null; renderApp(); } },
  });
  const repeat = col.key === 'monthly'
    ? h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: S.composer.repeat, onchange: (e) => { S.composer.repeat = e.target.checked; } }), 'Repetir todos os meses')
    : null;
  return h('form', {
    class: 'composer',
    onsubmit: (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      mutate(() => api('POST', '/api/tasks', { member_id: m.id, title, ...col.patch, repeat: col.key === 'monthly' && S.composer?.repeat }));
    },
  }, input,
  h('div', { class: 'row' }, repeat,
    h('button', { class: 'btn small primary', type: 'submit' }, 'Adicionar'),
    h('button', { class: 'icon-btn', type: 'button', title: 'Fechar (Esc)', 'aria-label': 'Fechar', onclick: () => { S.composer = null; renderApp(); } }, icon('close'))));
}

function card(t) {
  const d = S.data;
  const late = t.due && t.status !== 'done' && t.due < d.today;
  const readOnly = d.archived;

  const tags = [
    t.recurring_id && h('span', { class: 'tag', title: 'Repete todos os meses' }, icon('repeat'), 'Mensal'),
    t.due && h('span', { class: `tag num ${late ? 'late' : ''}`, title: late ? 'Prazo ultrapassado' : 'Prazo' }, icon('clock'), dayLabel(t.due)),
    t.origin_month !== t.month && h('span', { class: 'tag carry', title: `Criada em ${monthLabel(t.origin_month)}` }, icon('carry'), `de ${MONTHS[Number(t.origin_month.slice(5)) - 1].slice(0, 3)}`),
    t.status === 'done' && t.done_at && h('span', { class: 'tag fin num', title: 'Concluída' }, icon('check'), dateTimeLabel(t.done_at).split(' ').slice(0, 2).join(' ')),
    t.notes && h('span', { class: 'tag', title: 'Tem notas' }, icon('note')),
  ].filter(Boolean);

  const btn = (name, label, patch) => h('button', {
    class: 'icon-btn', type: 'button', title: label, 'aria-label': `${label}: ${t.title}`,
    onclick: (e) => { e.stopPropagation(); setStatus(t, patch); },
  }, icon(name));
  const actions = readOnly ? [] : t.status === 'todo'
    ? [btn('play', 'Iniciar', { status: 'doing' }), btn('check', 'Concluir', { status: 'done' })]
    : t.status === 'doing'
      ? [btn('undo', 'Voltar a por fazer', { status: 'todo' }), btn('check', 'Concluir', { status: 'done' })]
      : [btn('undo', 'Reabrir', { status: 'todo' })];

  const el = h('article', {
    class: `card ${t.status} ${late ? 'late' : ''}`, dataset: { id: t.id }, tabindex: 0, role: 'button',
    'aria-label': `${t.title}. Abrir detalhes`, draggable: !readOnly,
    onclick: () => openTaskDialog(t),
    onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); openTaskDialog(t); } },
  }, h('div', { class: 'title' }, t.title), tags.length ? h('div', { class: 'meta' }, tags) : null, actions.length ? h('div', { class: 'actions' }, actions) : null);

  if (!readOnly) {
    el.addEventListener('dragstart', (e) => {
      S.dragId = t.id;
      e.dataTransfer.setData('text/plain', String(t.id));
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => { endDrag(); flushPending(); });
  }
  return el;
}

// ---------- arrastar e largar ----------

let dropLine = null;
function dropRef(body, y) {
  for (const c of body.querySelectorAll('.card:not(.dragging)')) {
    const r = c.getBoundingClientRect();
    if (y < r.top + r.height / 2) return c;
  }
  return null;
}
function endDrag() {
  S.dragId = null;
  dropLine?.remove();
  document.querySelectorAll('.col.over').forEach((c) => c.classList.remove('over'));
  document.querySelectorAll('.card.dragging').forEach((c) => c.classList.remove('dragging'));
}
function wireDrop(el, body, memberId, colKey) {
  el.addEventListener('dragover', (e) => {
    if (!S.dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('over');
    if (colKey === 'done') return;
    dropLine ??= h('div', { class: 'drop-line' });
    const ref = dropRef(body, e.clientY);
    if (ref) ref.before(dropLine); else body.append(dropLine);
  });
  el.addEventListener('dragleave', (e) => {
    if (el.contains(e.relatedTarget)) return;
    el.classList.remove('over');
    dropLine?.remove();
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = S.dragId;
    const ref = colKey === 'done' ? null : dropRef(body, e.clientY);
    endDrag();
    if (id) moveTask(id, memberId, colKey, ref ? Number(ref.dataset.id) : undefined);
  });
}

async function moveTask(id, memberId, colKey, beforeId) {
  const t = S.data.tasks.find((x) => x.id === id);
  if (!t) return;
  const col = COLS.find((c) => c.key === colKey);
  if (t.member_id === memberId && columnOf(t) === colKey && colKey === 'done') return;
  const patch = { member_id: memberId, ...col.patch };
  if (colKey !== 'done') {
    if (beforeId) patch.before_id = beforeId; else patch.to_end = true;
  }
  const target = beforeId && S.data.tasks.find((x) => x.id === beforeId);
  Object.assign(t, { member_id: memberId, ...col.patch }, target ? { position: target.position - 0.5 } : { position: Date.now() });
  renderApp();
  await mutate(() => api('PATCH', `/api/tasks/${id}`, patch));
  const m = memberOf(memberId);
  if (m && absenceNow(memberId)) toast(`${m.name} está ausente hoje.`);
}

async function setStatus(t, patch) {
  Object.assign(t, patch);
  renderApp();
  await mutate(() => api('PATCH', `/api/tasks/${t.id}`, patch));
}

// ---------- diálogos ----------

const dlg = () => document.getElementById('dialog');
function openDialog(node) {
  dlg().replaceChildren(node);
  if (!dlg().open) dlg().showModal();
}
function closeDialog() { if (dlg().open) dlg().close(); }
document.getElementById('dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
document.getElementById('dialog').addEventListener('close', () => { dlg().replaceChildren(); setTimeout(flushPending, 50); });

function field(label, control, full = false) {
  return h('label', { class: full ? 'full' : '' }, label, control);
}
function select(id, options, value, disabled = false) {
  return h('select', { id, disabled, value: String(value) }, options.map(([v, l]) => h('option', { value: String(v) }, l)));
}
function dialogShell(title, body, foot) {
  return h('div', { class: 'dlg' },
    h('div', { class: 'dlg-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: closeDialog }, icon('close'))),
    body, foot);
}

function openTaskDialog(task, { memberId } = {}) {
  const d = S.data;
  const isNew = !task;
  const ro = !isNew && d.archived;
  const t = task || { title: '', notes: '', member_id: memberId ?? activeMembers()[0].id, kind: 'flex', status: 'todo', due: null };

  const title = h('input', { type: 'text', id: 't-title', maxlength: 200, required: true, value: t.title, disabled: ro });
  const notes = h('textarea', { id: 't-notes', maxlength: 2000, disabled: ro, placeholder: 'Detalhes, links, o que falta fazer…' });
  notes.value = t.notes || '';
  const who = select('t-who', d.members.filter((m) => m.active || m.id === t.member_id).map((m) => [m.id, m.name]), t.member_id, ro);
  const status = select('t-status', [['todo', 'Por fazer'], ['doing', 'Em progresso'], ['done', 'Concluída']], t.status, ro);
  const kind = select('t-kind', [['flex', 'Semanal / diária'], ['monthly', 'Mensal']], t.kind, ro);
  const due = h('input', { type: 'date', id: 't-due', value: t.due || '', disabled: ro });
  const repeat = h('input', { type: 'checkbox', id: 't-repeat', checked: false });
  const repeatRow = h('label', { class: 'switch full' }, repeat, 'Repetir todos os meses');
  const syncRepeat = () => { repeatRow.hidden = !(isNew && kind.value === 'monthly'); };
  kind.addEventListener('change', syncRepeat);
  syncRepeat();
  const err = h('p', { class: 'err', hidden: true });

  const meta = [];
  if (!isNew) {
    meta.push(h('span', {}, `Criada em ${dateTimeLabel(t.created_at)}`));
    if (t.origin_month !== t.month) meta.push(h('span', {}, `Transitada de ${monthLabel(t.origin_month)}`));
    if (t.recurring_id) meta.push(h('span', {}, 'Tarefa recorrente (volta todos os meses)'));
    if (t.done_at) meta.push(h('span', {}, `Concluída em ${dateTimeLabel(t.done_at)}`));
  }

  const body = h('div', { class: 'dlg-body' },
    field('Título', title, true),
    field('Notas', notes, true),
    field('Pessoa', who), field('Estado', status),
    field('Tipo', kind), field('Prazo (opcional)', due),
    repeatRow,
    meta.length ? h('div', { class: 'dlg-meta' }, meta) : null,
    err);

  const foot = h('div', { class: 'dlg-foot' },
    !isNew && !ro && h('button', {
      class: 'btn danger', type: 'button',
      onclick: async () => {
        if (!confirm(`Apagar a tarefa "${t.title}"?`)) return;
        closeDialog();
        await mutate(() => api('DELETE', `/api/tasks/${t.id}`));
      },
    }, icon('trash'), 'Apagar'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onclick: closeDialog }, ro ? 'Fechar' : 'Cancelar'),
    !ro && h('button', { class: 'btn primary', type: 'submit' }, isNew ? 'Criar tarefa' : 'Guardar'));

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      const payload = {
        title: title.value, notes: notes.value, member_id: Number(who.value), status: status.value, kind: kind.value,
        due: due.value || null,
      };
      try {
        if (isNew) await api('POST', '/api/tasks', { ...payload, repeat: repeat.checked });
        else await api('PATCH', `/api/tasks/${t.id}`, payload);
        closeDialog();
        await refresh();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    },
  }, dialogShell(isNew ? 'Nova tarefa' : ro ? 'Tarefa arquivada' : 'Tarefa', body, foot));

  openDialog(form);
  if (isNew) title.focus();
}

function openAbsenceDialog(absence, memberId) {
  const d = S.data;
  const isNew = !absence;
  const a = absence || { member_id: memberId ?? activeMembers()[0].id, type: 'ferias', start_date: d.today, end_date: d.today, note: '' };
  const who = select('a-who', d.members.filter((m) => m.active || m.id === a.member_id).map((m) => [m.id, m.name]), a.member_id);
  const type = select('a-type', Object.entries(TYPES), a.type);
  const from = h('input', { type: 'date', id: 'a-from', required: true, value: a.start_date });
  const to = h('input', { type: 'date', id: 'a-to', required: true, value: a.end_date });
  from.addEventListener('change', () => { if (!to.value || to.value < from.value) to.value = from.value; to.min = from.value; });
  to.min = from.value;
  const note = h('input', { type: 'text', id: 'a-note', maxlength: 200, value: a.note || '', placeholder: 'Opcional' });
  const info = h('div', { class: 'dlg-meta' });
  const updateInfo = () => {
    info.replaceChildren();
    if (from.value && to.value && to.value >= from.value) {
      const n = workdaysBetween(from.value, to.value, d.extraHolidays);
      info.append(h('span', {}, `${n} ${n === 1 ? 'dia útil' : 'dias úteis'} (sem fins de semana nem feriados nacionais)`));
    }
  };
  from.addEventListener('change', updateInfo); to.addEventListener('change', updateInfo); updateInfo();
  const err = h('p', { class: 'err', hidden: true });

  const body = h('div', { class: 'dlg-body' },
    field('Pessoa', who), field('Tipo', type),
    field('Primeiro dia', from), field('Último dia', to),
    field('Nota', note, true), info, err);
  const foot = h('div', { class: 'dlg-foot' },
    !isNew && h('button', {
      class: 'btn danger', type: 'button',
      onclick: async () => {
        if (!confirm('Apagar esta ausência?')) return;
        closeDialog();
        await mutate(() => api('DELETE', `/api/absences/${a.id}`));
      },
    }, icon('trash'), 'Apagar'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Cancelar'),
    h('button', { class: 'btn primary', type: 'submit' }, isNew ? 'Registar' : 'Guardar'));

  openDialog(h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      const payload = { member_id: Number(who.value), type: type.value, start_date: from.value, end_date: to.value, note: note.value };
      try {
        if (isNew) await api('POST', '/api/absences', payload); else await api('PATCH', `/api/absences/${a.id}`, payload);
        closeDialog();
        await refresh();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    },
  }, dialogShell(isNew ? 'Registar ausência' : 'Editar ausência', body, foot)));
}

// ---------- vista: Ausências ----------

function viewAbsences() {
  const d = S.data;
  const month = S.absMonth || d.currentMonth;
  const page = h('div', { class: 'page' });

  const nav = h('div', { class: 'month-nav' },
    h('button', { class: 'icon-btn', title: 'Mês anterior', 'aria-label': 'Mês anterior', onclick: () => { S.absMonth = addMonths(month, -1); renderApp(); } }, icon('left')),
    h('span', { class: 'label' }, cap(monthLabel(month))),
    h('button', { class: 'icon-btn', title: 'Mês seguinte', 'aria-label': 'Mês seguinte', onclick: () => { S.absMonth = addMonths(month, 1); renderApp(); } }, icon('right')));
  page.append(h('div', { class: 'toolbar' }, h('h1', {}, 'Ausências'), nav,
    month !== d.currentMonth && h('button', { class: 'btn small', onclick: () => { S.absMonth = d.currentMonth; renderApp(); } }, 'Este mês'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn primary', onclick: () => openAbsenceDialog(null) }, icon('plus'), 'Registar ausência')));

  page.append(presenceStrip());
  page.append(h('div', { class: 'panel' }, h('div', { class: 'tl-wrap' }, timeline(month)),
    h('div', { class: 'panel-pad legend' },
      h('span', {}, h('i'), 'Férias'), h('span', {}, h('i', { class: 'l-aus' }), 'Ausência'), h('span', {}, h('i', { class: 'l-for' }), 'Formação'),
      h('span', {}, h('i', { class: 'l-we' }), 'Fim de semana'), h('span', {}, h('i', { class: 'l-ho' }), 'Feriado nacional'))));

  const upcoming = d.absences.filter((a) => a.end_date >= d.today);
  const past = d.absences.filter((a) => a.end_date < d.today).reverse().slice(0, 30);
  page.append(h('section', { class: 'panel' },
    h('div', { class: 'section-title' }, h('h2', {}, 'Em curso e próximas')),
    upcoming.length ? h('div', { class: 'list' }, upcoming.map(absenceRow)) : h('p', { class: 'panel-pad muted' }, 'Sem ausências marcadas. Usa “Registar ausência” para começar.')));
  if (past.length) {
    page.append(h('details', { class: 'panel' },
      h('summary', { class: 'panel-pad', style: { cursor: 'pointer', fontWeight: '650' } }, `Passadas (${past.length})`),
      h('div', { class: 'list' }, past.map(absenceRow))));
  }
  return page;
}

function absenceRow(a) {
  const d = S.data;
  const m = memberOf(a.member_id);
  const n = workdaysBetween(a.start_date, a.end_date, d.extraHolidays);
  const now = a.start_date <= d.today && a.end_date >= d.today;
  return h('div', { class: 'list-row', style: mStyle(m) },
    avatar(m),
    h('div', { class: 'grow' },
      h('div', {}, h('span', { class: 'when num' }, rangeLabel(a.start_date, a.end_date)), ' ', h('span', { class: 'muted' }, `· ${m.name}`)),
      a.note && h('div', { class: 'muted' }, a.note)),
    now && h('span', { class: 'pill now' }, 'Agora'),
    h('span', { class: 'pill' }, TYPES[a.type]),
    h('span', { class: 'muted num' }, `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`),
    h('button', { class: 'icon-btn', title: 'Editar', 'aria-label': 'Editar ausência', onclick: () => openAbsenceDialog(a) }, icon('edit')));
}

function timeline(month) {
  const d = S.data;
  const extra = d.extraHolidays;
  const n = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${pad(n)}`;
  const members = d.members.filter((m) => m.active || d.absences.some((a) => a.member_id === m.id && a.start_date <= last && a.end_date >= first));
  const grid = h('div', { class: 'tl', style: { '--days': n } });
  const place = (el, row, col) => { el.style.gridRow = String(row); el.style.gridColumn = String(col); return el; };

  grid.append(place(h('div', { class: 'tl-corner' }), 1, 1));
  for (let i = 1; i <= n; i += 1) {
    const date = `${month}-${pad(i)}`;
    const wd = weekday(date);
    const ho = holidayName(date, extra);
    grid.append(place(h('div', {
      class: `tl-day ${wd === 0 || wd === 6 ? 'we' : ''} ${ho ? 'ho' : ''} ${date === d.today ? 'today' : ''}`,
      title: `${WEEKDAYS_SHORT[wd]}, ${dayLabel(date)}${ho ? ` · ${ho}` : ''}`,
    }, h('b', { class: 'num' }, i), WEEKDAYS_SHORT[wd][0].toUpperCase()), 1, i + 1));
  }

  members.forEach((m, r) => {
    const row = r + 2;
    grid.append(place(h('div', { class: 'tl-name', style: mStyle(m) }, h('span', { class: 'dot' }), h('span', {}, m.name)), row, 1));
    for (let i = 1; i <= n; i += 1) {
      const date = `${month}-${pad(i)}`;
      const wd = weekday(date);
      grid.append(place(h('div', { class: `tl-cell ${wd === 0 || wd === 6 ? 'we' : ''} ${holidayName(date, extra) ? 'ho' : ''} ${date === d.today ? 'today' : ''}` }), row, i + 1));
    }
    for (const a of d.absences) {
      if (a.member_id !== m.id || a.end_date < first || a.start_date > last) continue;
      const s = a.start_date < first ? first : a.start_date;
      const e = a.end_date > last ? last : a.end_date;
      const c1 = Number(s.slice(8)) + 1;
      const c2 = Number(e.slice(8)) + 2;
      const label = `${TYPES[a.type]}${a.note ? ` · ${a.note}` : ''}`;
      const span = c2 - c1;
      const bar = h('button', {
        class: `tl-bar ${a.start_date < first ? 'cut-l' : ''} ${a.end_date > last ? 'cut-r' : ''}`,
        dataset: { type: a.type }, style: mStyle(m), type: 'button',
        title: `${m.name} · ${TYPES[a.type]} · ${rangeLabel(a.start_date, a.end_date)}${a.note ? ` · ${a.note}` : ''}`,
        'aria-label': `${m.name}, ${label}, ${rangeLabel(a.start_date, a.end_date)}. Editar`,
        onclick: () => openAbsenceDialog(a),
      }, span > 1 ? label : '');
      grid.append(place(bar, row, `${c1} / ${c2}`));
    }
  });
  return grid;
}

// ---------- vista: Histórico ----------

function viewHistory() {
  const d = S.data;
  const hist = S.history || [];
  const page = h('div', { class: 'page' });
  page.append(h('div', { class: 'toolbar' }, h('h1', {}, 'Histórico mensal'), h('span', { class: 'spacer' }),
    h('button', { class: 'btn', onclick: () => downloadFrom('/api/backup', 'application/json') }, icon('download'), 'Exportar cópia (JSON)')));

  page.append(h('section', { class: 'panel panel-pad' },
    h('h2', {}, 'Como se renova cada mês'),
    h('p', { class: 'muted', style: { marginTop: '6px', maxWidth: '78ch' } },
      'No primeiro dia do mês o quadro abre um mês novo sozinho. As tarefas mensais recorrentes voltam como novas, as semanais/diárias por concluir e tudo o que está em progresso passam para o mês novo, e o que ficou concluído fica guardado aqui. As mensais que ninguém concluiu ficam no arquivo do mês a que pertenciam.')));

  page.append(h('div', { class: 'months' }, hist.map((mo) => {
    const pct = mo.total ? Math.round((mo.done / mo.total) * 100) : 0;
    const current = mo.month === d.currentMonth;
    return h('article', { class: 'panel month-card' },
      h('h2', {}, cap(monthLabel(mo.month)), current && h('span', { class: 'pill now' }, 'A decorrer')),
      h('div', { class: 'big num' }, `${mo.done}`, h('small', {}, ` de ${mo.total} tarefas concluídas (${pct}%)`)),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        mo.members.sort((a, b) => a.member_id - b.member_id).map((mm) => {
          const m = memberOf(mm.member_id);
          if (!m) return null;
          const p = mm.total ? Math.round((mm.done / mm.total) * 100) : 0;
          return h('div', { class: 'mrow', style: mStyle(m) },
            h('span', { class: 'nm' }, h('span', { class: 'dot' }), m.name),
            h('div', { class: 'meter', style: { '--pct': `${p}%` } }, h('i')),
            h('span', { class: 'num muted' }, `${mm.done}/${mm.total}`));
        }),
        !mo.members.length && h('p', { class: 'muted' }, 'Ainda sem tarefas.')),
      mo.carried ? h('p', { class: 'muted' }, `${mo.carried} ${mo.carried === 1 ? 'tarefa transitou' : 'tarefas transitaram'} do mês anterior.`) : null,
      h('div', { class: 'btns' },
        h('a', { class: 'btn small', href: current ? '#workflow' : `#workflow/${mo.month}` }, 'Abrir quadro'),
        h('button', { class: 'btn small', onclick: () => downloadFrom(`/api/export/${mo.month}.csv`, 'text/csv;charset=utf-8') }, icon('download'), 'CSV para Excel')));
  })));
  return page;
}

// ---------- vista: Definições ----------

function viewSettings() {
  const d = S.data;
  const page = h('div', { class: 'page narrow' });
  page.append(h('div', { class: 'toolbar' }, h('h1', {}, 'Definições')));

  // Equipa
  const team = h('section', { class: 'panel' },
    h('div', { class: 'section-title' }, h('h2', {}, 'Equipa'), h('p', {}, 'Nomes e cores aparecem no quadro, nas ausências e no histórico. Quem for ocultado deixa de ter faixa, mas o histórico mantém-se.')));
  for (const m of d.members) {
    const name = h('input', {
      type: 'text', value: m.name, maxlength: 60, 'aria-label': `Nome de ${m.name}`,
      onchange: (e) => mutate(() => api('PATCH', `/api/members/${m.id}`, { name: e.target.value })),
    });
    const sw = h('div', { class: 'sw', role: 'group', 'aria-label': 'Cor' }, d.palette.map((c) => h('button', {
      type: 'button', style: { '--c': c }, 'aria-pressed': String(c === m.color), 'aria-label': `Cor ${c}`,
      onclick: () => mutate(() => api('PATCH', `/api/members/${m.id}`, { color: c })),
    })));
    const vis = h('label', { class: 'switch' }, h('input', {
      type: 'checkbox', checked: Boolean(m.active),
      onchange: (e) => mutate(() => api('PATCH', `/api/members/${m.id}`, { active: e.target.checked })),
    }), 'Visível no quadro');
    team.append(h('div', { class: 'form-row', style: mStyle(m) }, avatar(m), h('div', { class: 'grow' }, name), sw, vis));
  }
  const newName = h('input', { type: 'text', maxlength: 60, placeholder: 'Nome da nova pessoa', 'aria-label': 'Nome da nova pessoa' });
  team.append(h('form', {
    class: 'form-row',
    onsubmit: (e) => { e.preventDefault(); if (newName.value.trim()) mutate(() => api('POST', '/api/members', { name: newName.value })); },
  }, h('div', { class: 'grow' }, newName), h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Adicionar pessoa')));
  page.append(team);

  // Recorrentes
  const rec = h('section', { class: 'panel' },
    h('div', { class: 'section-title' }, h('h2', {}, 'Tarefas mensais recorrentes'),
      h('p', {}, 'Voltam como nova tarefa mensal no início de cada mês. Alterar o título aplica-se a partir do próximo mês. Apagar uma tarefa recorrente remove também a cópia deste mês, se ainda estiver por fazer.')));
  for (const m of activeMembers()) {
    rec.append(h('div', { class: 'subhead', style: mStyle(m) }, avatar(m), m.name));
    for (const r of d.recurring.filter((x) => x.member_id === m.id)) {
      rec.append(h('div', { class: 'form-row' },
        h('div', { class: 'grow' }, h('input', {
          type: 'text', value: r.title, maxlength: 200, 'aria-label': 'Título da tarefa recorrente',
          onchange: (e) => mutate(() => api('PATCH', `/api/recurring/${r.id}`, { title: e.target.value })),
        })),
        h('label', { class: 'switch' }, h('input', {
          type: 'checkbox', checked: Boolean(r.active),
          onchange: (e) => mutate(() => api('PATCH', `/api/recurring/${r.id}`, { active: e.target.checked })),
        }), 'Ativa'),
        h('button', {
          class: 'icon-btn danger', title: 'Apagar', 'aria-label': `Apagar ${r.title}`,
          onclick: () => { if (confirm(`Apagar a tarefa recorrente "${r.title}"?`)) mutate(() => api('DELETE', `/api/recurring/${r.id}`)); },
        }, icon('trash'))));
    }
    const input = h('input', { type: 'text', maxlength: 200, placeholder: 'Nova tarefa recorrente…', 'aria-label': `Nova tarefa recorrente de ${m.name}` });
    rec.append(h('form', {
      class: 'form-row',
      onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) mutate(() => api('POST', '/api/recurring', { member_id: m.id, title: input.value })); },
    }, h('div', { class: 'grow' }, input), h('button', { class: 'btn small', type: 'submit' }, icon('plus'), 'Adicionar')));
  }
  page.append(rec);

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true, id: 'import-file',
    onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); },
  });
  page.append(h('section', { class: 'panel' },
    h('div', { class: 'section-title' }, h('h2', {}, 'Dados'),
      h('p', {}, 'Os dados ficam guardados neste browser, neste computador. Para os levar para outro browser ou computador, ou para guardar uma cópia, exporta e importa o ficheiro JSON.')),
    h('div', { class: 'form-row' },
      h('button', { class: 'btn', onclick: () => downloadFrom('/api/backup', 'application/json') }, icon('download'), 'Exportar cópia (JSON)'),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Importar cópia…'), fileInput),
    h('div', { class: 'form-row' },
      h('button', {
        class: 'btn',
        onclick: () => { if (confirm('Substituir TODOS os dados por dados de exemplo?')) mutate(() => api('POST', '/api/demo', {})); },
      }, 'Carregar dados de exemplo'),
      h('button', {
        class: 'btn danger',
        onclick: () => { if (confirm('Apagar TODAS as tarefas, ausências e histórico deste browser? Isto não se pode desfazer.')) mutate(() => api('POST', '/api/reset', {})); },
      }, icon('trash'), 'Apagar todos os dados'))));
  return page;
}

// ---------- arranque ----------

parseHash();
renderApp();
refresh().then(() => { if (S.volatile) toast('Este browser não deixa guardar dados. O que fizeres perde-se ao fechar.', 'error'); });
