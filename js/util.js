// Utilitários: criação de elementos, ícones, datas e feriados nacionais.
import { addDays, addMonths } from './dates.js';
export { addDays, addMonths };

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'draggable') el[k] = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const append = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(append);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(append);
  if (value !== undefined) el.value = value; // depois das <option>
  return el;
}

const ICONS = {
  play: '<polygon points="7 4 19 12 7 20 7 4"/>',
  check: '<polyline points="4 12 10 18 20 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  left: '<polyline points="15 5 8 12 15 19"/>',
  right: '<polyline points="9 5 16 12 9 19"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  note: '<path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  carry: '<path d="M4 12h13M12 6l6 6-6 6"/><path d="M20 5v14"/>',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

// ---------- datas (sempre como texto "YYYY-MM-DD" para não haver surpresas de fuso horário) ----------

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad = (n) => String(n).padStart(2, '0');
export const utc = (s) => new Date(`${s}T00:00:00Z`);
export const iso = (d) => d.toISOString().slice(0, 10);
export const weekday = (s) => utc(s).getUTCDay();

export const daysInMonth = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}
export function dayLabel(s) {
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
export function dayLabelYear(s) { return `${dayLabel(s)} ${s.slice(0, 4)}`; }
export function rangeLabel(a, b) {
  if (a === b) return dayLabel(a);
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${dayLabelYear(a)} – ${dayLabelYear(b)}`;
  return `${dayLabel(a)} – ${dayLabel(b)}`;
}
export function dateTimeLabel(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- feriados nacionais ----------

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31);
  const day = ((hh + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}

const holidayCache = new Map();
export function holidays(year, extra = []) {
  const key = `${year}|${extra.join(',')}`;
  if (holidayCache.has(key)) return holidayCache.get(key);
  const e = easter(year);
  const map = new Map([
    [`${year}-01-01`, 'Ano Novo'],
    [addDays(e, -2), 'Sexta-feira Santa'],
    [e, 'Páscoa'],
    [`${year}-04-25`, 'Dia da Liberdade'],
    [`${year}-05-01`, 'Dia do Trabalhador'],
    [addDays(e, 60), 'Corpo de Deus'],
    [`${year}-06-10`, 'Dia de Portugal'],
    [`${year}-08-15`, 'Assunção de Nossa Senhora'],
    [`${year}-10-05`, 'Implantação da República'],
    [`${year}-11-01`, 'Todos os Santos'],
    [`${year}-12-01`, 'Restauração da Independência'],
    [`${year}-12-08`, 'Imaculada Conceição'],
    [`${year}-12-25`, 'Natal'],
  ]);
  for (const d of extra) if (d.startsWith(String(year))) map.set(d, 'Feriado local');
  holidayCache.set(key, map);
  return map;
}

export function holidayName(date, extra = []) {
  return holidays(Number(date.slice(0, 4)), extra).get(date) || null;
}

export function isWorkday(date, extra = []) {
  const wd = weekday(date);
  return wd !== 0 && wd !== 6 && !holidayName(date, extra);
}

export function workdaysBetween(a, b, extra = []) {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (isWorkday(d, extra)) n += 1;
  return n;
}

export const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
