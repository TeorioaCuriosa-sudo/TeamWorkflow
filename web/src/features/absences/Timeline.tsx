import { useEffect, useRef } from 'react';
import type { Absence, AbsenceType } from '../../api/types';
import { cx, vars } from '../../lib/cx';
import { daysInMonth, dayLabel, holidayName, pad, rangeLabel, WEEKDAYS_SHORT, weekday } from '../../lib/dates';
import { ABSENCE_TYPES } from '../../lib/labels';
import { useData } from '../../state/data';

/** Nomes escritos por extenso (e não montados com `bar-${tipo}`) para o Tailwind os encontrar e gerar. */
const BAR_CLASS: Record<AbsenceType, string> = {
  ferias: 'bar-ferias',
  ausencia: 'bar-ausencia',
  formacao: 'bar-formacao',
};

/** A linha do tempo do mês: uma linha por pessoa, uma coluna por dia, barras para as ausências. */
export function Timeline({ month, onEdit }: { month: string; onEdit: (a: Absence) => void }) {
  const { data } = useData();
  const scroller = useRef<HTMLDivElement>(null);
  const todayCell = useRef<HTMLDivElement>(null);

  const extra = data.extraHolidays;
  const n = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${pad(n)}`;
  const members = data.members.filter(
    (m) => !m.removed && (m.active || data.absences.some((a) => a.member_id === m.id && a.start_date <= last && a.end_date >= first)),
  );
  const dates = Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`);

  // Em ecrãs estreitos, abre já perto do dia de hoje.
  useEffect(() => {
    const sc = scroller.current;
    const today = todayCell.current;
    if (sc && today) sc.scrollLeft = Math.max(0, today.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft - 160);
  }, [month]);

  return (
    <div ref={scroller} className="overflow-x-auto">
      <div
        className="grid min-w-[44rem]"
        style={{ gridTemplateColumns: `9.5rem repeat(${n}, minmax(1.75rem, 1fr))` }}
      >
        <div style={{ gridRow: 1, gridColumn: 1 }} className="sticky left-0 z-20 border-b border-line bg-surface" />
        {dates.map((date, i) => {
          const wd = weekday(date);
          const ho = holidayName(date, extra);
          const today = date === data.today;
          return (
            <div
              key={date}
              ref={today ? todayCell : undefined}
              style={{ gridRow: 1, gridColumn: i + 2 }}
              title={`${WEEKDAYS_SHORT[wd]}, ${dayLabel(date)}${ho ? ` · ${ho}` : ''}`}
              className={cx(
                'border-b border-l border-line py-1.5 text-center text-[11px] leading-tight text-ink-3',
                (wd === 0 || wd === 6) && 'bg-surface-3/70',
                ho && 'bg-danger-soft/70',
              )}
            >
              <b className={cx('num mx-auto grid size-[22px] place-items-center rounded-full text-[13px] font-semibold', today ? 'bg-primary text-on-primary' : 'text-ink')}>{i + 1}</b>
              {WEEKDAYS_SHORT[wd][0].toUpperCase()}
            </div>
          );
        })}

        {members.map((m, r) => {
          const row = r + 2;
          return [
            <div key={`n${m.id}`} style={{ gridRow: row, gridColumn: 1 }} className="sticky left-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-surface px-3 text-sm font-medium text-ink">
              <span aria-hidden style={{ backgroundColor: m.color }} className="size-2.5 shrink-0 rounded-full" />
              <span className="truncate">{m.name}</span>
            </div>,
            ...dates.map((date, i) => {
              const wd = weekday(date);
              return (
                <div
                  key={`${m.id}-${date}`}
                  style={{ gridRow: row, gridColumn: i + 2 }}
                  className={cx(
                    'h-12 border-b border-l border-line',
                    (wd === 0 || wd === 6) && 'bg-surface-3/70',
                    holidayName(date, extra) && 'bg-danger-soft/70',
                    date === data.today && 'bg-info-soft/60',
                  )}
                />
              );
            }),
            ...data.absences
              .filter((a) => a.member_id === m.id && a.end_date >= first && a.start_date <= last)
              .map((a) => {
                const s = a.start_date < first ? first : a.start_date;
                const e = a.end_date > last ? last : a.end_date;
                const c1 = Number(s.slice(8)) + 1;
                const c2 = Number(e.slice(8)) + 2;
                const label = `${ABSENCE_TYPES[a.type]}${a.note ? ` · ${a.note}` : ''}`;
                return (
                  <button
                    key={`a${a.id}`}
                    type="button"
                    onClick={() => onEdit(a)}
                    style={{ ...vars({ '--m': m.color }), gridRow: row, gridColumn: `${c1} / ${c2}` }}
                    title={`${m.name} · ${ABSENCE_TYPES[a.type]} · ${rangeLabel(a.start_date, a.end_date)}${a.note ? ` · ${a.note}` : ''}`}
                    aria-label={`${m.name}, ${label}, ${rangeLabel(a.start_date, a.end_date)}. Editar`}
                    className={cx(
                      'z-10 mx-0.5 flex h-7 items-center self-center overflow-hidden rounded-md px-2 text-left text-xs font-semibold whitespace-nowrap transition-[filter] hover:brightness-110',
                      BAR_CLASS[a.type],
                      a.start_date < first && 'ml-0 rounded-l-none',
                      a.end_date > last && 'mr-0 rounded-r-none',
                    )}
                  >
                    {c2 - c1 > 1 ? label : ''}
                  </button>
                );
              }),
          ];
        })}
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-4 py-3 text-xs text-ink-2">
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm bg-ink-3" />Férias</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--ink-3)_0_5px,var(--line-strong)_5px_10px)]" />Ausência</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm shadow-[inset_0_0_0_2px_var(--ink-3)]" />Formação</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm border border-line-strong bg-surface-3" />Fim de semana</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm border border-line-strong bg-danger-soft" />Feriado nacional</li>
    </ul>
  );
}
