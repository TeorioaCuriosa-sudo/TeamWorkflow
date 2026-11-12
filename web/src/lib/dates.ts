// Datas e feriados. As datas viajam sempre como texto "AAAA-MM-DD" (e meses "AAAA-MM")
// para nunca haver surpresas de fuso horário.

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const pad = (n: number) => String(n).padStart(2, '0');
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number): string {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export const weekday = (s: string) => utc(s).getUTCDay();

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const isMonth = (s: string | undefined): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(s ?? '');

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "outubro de 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}
/** "out" — para etiquetas curtas ("de out"). */
export function monthShort(month: string): string {
  return MONTHS_SHORT[Number(month.slice(5, 7)) - 1];
}
/** "12 nov" */
export function dayLabel(s: string): string {
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
export const dayLabelYear = (s: string) => `${dayLabel(s)} ${s.slice(0, 4)}`;

export function rangeLabel(a: string, b: string): string {
  if (a === b) return dayLabel(a);
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${dayLabelYear(a)} – ${dayLabelYear(b)}`;
  return `${dayLabel(a)} – ${dayLabel(b)}`;
}

export function timeLabel(isoString: string): string {
  const d = new Date(isoString);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "agora", "há 5 min", "há 3 h", "hoje 14:05", "ontem 14:05", "12 nov 14:05". */
export function timeAgo(isoString: string, now = Date.now()): string {
  const d = new Date(isoString);
  const diff = Math.max(0, now - d.getTime());
  if (diff < 45_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.max(1, Math.round(diff / 60_000))} min`;
  if (diff < 6 * 3_600_000) return `há ${Math.round(diff / 3_600_000)} h`;
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) return `hoje ${timeLabel(isoString)}`;
  if (new Date(now - 86_400_000).toDateString() === d.toDateString()) return `ontem ${timeLabel(isoString)}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${timeLabel(isoString)}`;
}

/** "12 nov 2026" a partir de um instante ISO. */
export function dateLabel(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Texto do separador de dia no chat: "Hoje", "Ontem" ou "quinta, 12 nov". */
export function dayHeading(isoString: string, now = Date.now()): string {
  const d = new Date(isoString);
  if (d.toDateString() === new Date(now).toDateString()) return 'Hoje';
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return 'Ontem';
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

// ---------- feriados nacionais ----------

function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31);
  const day = ((hh + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}

const holidayCache = new Map<string, Map<string, string>>();
function holidays(year: number, extra: string[]): Map<string, string> {
  const key = `${year}|${extra.join(',')}`;
  const cached = holidayCache.get(key);
  if (cached) return cached;
  const e = easter(year);
  const map = new Map<string, string>([
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

export function holidayName(date: string, extra: string[] = []): string | null {
  return holidays(Number(date.slice(0, 4)), extra).get(date) ?? null;
}

export function isWorkday(date: string, extra: string[] = []): boolean {
  const wd = weekday(date);
  return wd !== 0 && wd !== 6 && !holidayName(date, extra);
}

export function workdaysBetween(a: string, b: string, extra: string[] = []): number {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (isWorkday(d, extra)) n += 1;
  return n;
}

export function nextWorkday(date: string, extra: string[] = []): string {
  let d = addDays(date, 1);
  for (let i = 0; i < 40 && !isWorkday(d, extra); i += 1) d = addDays(d, 1);
  return d;
}
