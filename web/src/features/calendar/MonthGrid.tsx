import type { Absence, Meeting } from '../../api/types';
import { cx, vars } from '../../lib/cx';
import { daysInMonth, holidayName, longDayLabel, pad, weekday } from '../../lib/dates';
import { ABSENCE_TYPES } from '../../lib/labels';
import { byTime } from '../../lib/meetings';
import { plural } from '../../lib/text';
import { useData, useTeam } from '../../state/data';

const HEAD = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const SHOWN = 3;

/** O mês em grelha: reuniões e ausências em cada dia. Em ecrãs pequenos, pontos; o dia escolhido mostra o detalhe por baixo. */
export function MonthGrid({ month, selected, onSelect, onOpenMeeting, onOpenAbsence }: {
  month: string;
  selected: string;
  onSelect: (date: string) => void;
  onOpenMeeting: (m: Meeting) => void;
  onOpenAbsence: (a: Absence) => void;
}) {
  const { data } = useData();
  const team = useTeam();
  const n = daysInMonth(month);
  const lead = (weekday(`${month}-01`) + 6) % 7; // a semana começa à segunda
  const cells = Math.ceil((lead + n) / 7) * 7;

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-medium text-ink-3 uppercase">
        {HEAD.map((h) => <span key={h} className="py-2">{h}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: cells }, (_, i) => {
          const day = i - lead + 1;
          if (day < 1 || day > n) return <div key={i} aria-hidden className="min-h-[4.25rem] border-b border-l border-line bg-surface-3/40 sm:min-h-[7.5rem]" />;
          const date = `${month}-${pad(day)}`;
          const wd = weekday(date);
          const holiday = holidayName(date, data.extraHolidays);
          const meetings = data.meetings.filter((m) => m.date === date).sort(byTime);
          const away = data.absences.filter((a) => a.start_date <= date && a.end_date >= date);
          const total = meetings.length + away.length;
          const isSelected = date === selected;
          const label = [
            longDayLabel(date),
            holiday,
            meetings.length ? plural(meetings.length, 'reunião', 'reuniões') : null,
            away.length ? plural(away.length, 'ausência', 'ausências') : null,
          ].filter(Boolean).join(', ');

          return (
            <div
              key={date}
              data-date={date}
              title={holiday ?? undefined}
              className={cx(
                'relative flex min-h-[4.25rem] flex-col gap-1 border-b border-l border-line p-1 sm:min-h-[7.5rem] sm:p-1.5',
                (wd === 0 || wd === 6) && 'bg-surface-3/70',
                holiday && 'bg-danger-soft/70',
                isSelected && 'z-[1] ring-2 ring-primary ring-inset',
              )}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={label}
                onClick={() => onSelect(date)}
                className={cx(
                  'num grid size-6 place-items-center self-start rounded-full text-xs font-semibold after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset',
                  date === data.today ? 'bg-primary text-on-primary' : 'text-ink',
                )}
              >
                {day}
              </button>

              <div className="relative z-10 hidden gap-1 sm:grid">
                {[...meetings.map((m) => ({ kind: 'm' as const, m })), ...away.map((a) => ({ kind: 'a' as const, a }))].slice(0, SHOWN).map((it) =>
                  it.kind === 'm' ? (
                    <button
                      key={`m${it.m.id}`}
                      type="button"
                      onClick={() => onOpenMeeting(it.m)}
                      title={`${it.m.start_time} ${it.m.title}`}
                      className="flex w-full items-center gap-1 truncate rounded-md bg-info-soft px-1.5 py-0.5 text-left text-[11px] font-medium text-info transition-[filter] hover:brightness-95"
                    >
                      <span className="num shrink-0">{it.m.start_time}</span>
                      <span className="truncate">{it.m.title}</span>
                    </button>
                  ) : (
                    <button
                      key={`a${it.a.id}`}
                      type="button"
                      onClick={() => onOpenAbsence(it.a)}
                      style={vars({ '--c': team.member(it.a.member_id)?.color ?? '#888888' })}
                      title={`${team.nameOf(it.a.member_id)} · ${ABSENCE_TYPES[it.a.type]}`}
                      className="tint tint-line w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium transition-[filter] hover:brightness-95"
                    >
                      {team.nameOf(it.a.member_id)} · {ABSENCE_TYPES[it.a.type].toLowerCase()}
                    </button>
                  ),
                )}
              </div>
              {total > SHOWN && <span className="hidden px-1 text-[11px] text-ink-3 sm:block">+{total - SHOWN} mais</span>}

              {total > 0 && (
                <span aria-hidden className="flex gap-0.5 px-0.5 sm:hidden">
                  {meetings.slice(0, 3).map((m) => <span key={`d${m.id}`} className="size-1.5 rounded-full bg-info" />)}
                  {away.slice(0, 3).map((a) => <span key={`e${a.id}`} className="size-1.5 rounded-full bg-ink-3" />)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
