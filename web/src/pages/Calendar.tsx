import { useState } from 'react';
import { CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import type { Absence } from '../api/types';
import { AbsenceDialog } from '../features/absences/AbsenceDialog';
import { Legend, Timeline } from '../features/absences/Timeline';
import { MeetingRow } from '../features/calendar/MeetingRow';
import { MonthGrid } from '../features/calendar/MonthGrid';
import { PresenceStrip } from '../features/people/PresenceStrip';
import { addMonths, cap, holidayName, longDayLabel, monthLabel, rangeLabel, workdaysBetween } from '../lib/dates';
import { ABSENCE_TYPES } from '../lib/labels';
import { byTime } from '../lib/meetings';
import { plural } from '../lib/text';
import { useData, useTeam } from '../state/data';
import { useDialogs } from '../state/dialogs';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { Badge } from '../ui/Chip';
import { Segmented } from '../ui/Fields';
import { Card, CardHeader, EmptyState, PageHeader } from '../ui/misc';

type View = 'month' | 'team';

/** O dia a mostrar quando se muda de mês: hoje, se estiver nesse mês, senão o dia 1. */
const defaultDay = (month: string, today: string) => (today.startsWith(month) ? today : `${month}-01`);

export function CalendarPage() {
  const { data } = useData();
  const { openMeeting, openNewMeeting } = useDialogs();
  const [month, setMonth] = useState(data.currentMonth);
  const [selected, setSelected] = useState(data.today);
  const [view, setView] = useState<View>('month');
  const [editing, setEditing] = useState<Absence | 'new' | null>(null);

  const upcomingMeetings = data.meetings.filter((m) => m.date >= data.today).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  const pastMeetings = data.meetings.filter((m) => m.date < data.today).sort((a, b) => b.date.localeCompare(a.date) || byTime(b, a)).slice(0, 20);
  const upcoming = data.absences.filter((a) => a.end_date >= data.today);
  const past = data.absences.filter((a) => a.end_date < data.today).reverse().slice(0, 30);

  function go(next: string) {
    setMonth(next);
    setSelected(defaultDay(next, data.today));
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Calendário"
        description="Reuniões, férias, ausências e formações da equipa."
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Registar ausência</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openNewMeeting(selected)}>Marcar reunião</Button>
          </>
        }
      />

      <PresenceStrip className="lg:hidden" />

      <Card>
        <CardHeader title="Próximas reuniões" description="Com o link da videochamada, entras com um clique." />
        {upcomingMeetings.length ? (
          <ul className="divide-y divide-line">{upcomingMeetings.slice(0, 8).map((m) => <MeetingRow key={m.id} meeting={m} />)}</ul>
        ) : (
          <EmptyState icon={<CalendarDays />} title="Sem reuniões marcadas" action={<Button onClick={() => openNewMeeting()}>Marcar reunião</Button>}>
            Marca uma reunião, junta o link do Meet, Teams ou Zoom e os convidados recebem um aviso.
          </EmptyState>
        )}
        {upcomingMeetings.length > 8 && <p className="border-t border-line px-5 py-2.5 text-[13px] text-ink-3">Mais {upcomingMeetings.length - 8} no calendário, nos meses seguintes.</p>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <IconButton label="Mês anterior" variant="secondary" onClick={() => go(addMonths(month, -1))}><ChevronLeft className="size-4" /></IconButton>
          <h2 className="min-w-40 text-center text-[15px] font-semibold text-ink">{cap(monthLabel(month))}</h2>
          <IconButton label="Mês seguinte" variant="secondary" onClick={() => go(addMonths(month, 1))}><ChevronRight className="size-4" /></IconButton>
          {month !== data.currentMonth && <Button size="sm" onClick={() => go(data.currentMonth)}>Este mês</Button>}
          <span className="flex-1" />
          <Segmented<View>
            label="Vista do calendário"
            value={view}
            onChange={setView}
            options={[{ value: 'month', label: 'Mês' }, { value: 'team', label: 'Equipa' }]}
          />
        </div>

        {view === 'month' ? (
          <>
            <MonthGrid month={month} selected={selected} onSelect={setSelected} onOpenMeeting={(m) => openMeeting(m.id)} onOpenAbsence={setEditing} />
            <DayPanel date={selected} onOpenAbsence={setEditing} />
          </>
        ) : (
          <>
            <Timeline month={month} onEdit={setEditing} />
            <Legend />
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Ausências em curso e próximas" />
        {upcoming.length ? (
          <ul className="divide-y divide-line">{upcoming.map((a) => <AbsenceRow key={a.id} absence={a} onEdit={setEditing} />)}</ul>
        ) : (
          <EmptyState icon={<CalendarOff />} title="Sem ausências marcadas" action={<Button onClick={() => setEditing('new')}>Registar ausência</Button>}>
            Quando alguém marcar férias, uma ausência ou uma formação, aparece aqui e no calendário.
          </EmptyState>
        )}
      </Card>

      {pastMeetings.length > 0 && (
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[15px] font-semibold text-ink select-none">
              <ChevronRight className="size-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
              Reuniões passadas ({pastMeetings.length})
            </summary>
            <ul className="divide-y divide-line border-t border-line">{pastMeetings.map((m) => <MeetingRow key={m.id} meeting={m} />)}</ul>
          </details>
        </Card>
      )}

      {past.length > 0 && (
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[15px] font-semibold text-ink select-none">
              <ChevronRight className="size-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
              Ausências passadas ({past.length})
            </summary>
            <ul className="divide-y divide-line border-t border-line">{past.map((a) => <AbsenceRow key={a.id} absence={a} onEdit={setEditing} />)}</ul>
          </details>
        </Card>
      )}

      {editing && <AbsenceDialog absence={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** O que há no dia escolhido na grelha, e o atalho para marcar uma reunião nesse dia. */
function DayPanel({ date, onOpenAbsence }: { date: string; onOpenAbsence: (a: Absence) => void }) {
  const { data } = useData();
  const { openNewMeeting } = useDialogs();
  const team = useTeam();
  const meetings = data.meetings.filter((m) => m.date === date).sort(byTime);
  const away = data.absences.filter((a) => a.start_date <= date && a.end_date >= date);
  const holiday = holidayName(date, data.extraHolidays);

  return (
    <section aria-label={`Dia ${longDayLabel(date)}`} className="grid gap-2 border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-sm font-semibold text-ink">{cap(longDayLabel(date))}</h3>
        {date === data.today && <Badge tone="info">Hoje</Badge>}
        {holiday && <Badge tone="danger">{holiday}</Badge>}
        <span className="flex-1" />
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openNewMeeting(date)}>Marcar reunião neste dia</Button>
      </div>
      {meetings.length === 0 && away.length === 0 && <p className="text-[13px] text-ink-3">Nada marcado para este dia.</p>}
      {meetings.length > 0 && <ul className="divide-y divide-line">{meetings.map((m) => <MeetingRow key={m.id} meeting={m} compact />)}</ul>}
      {away.length > 0 && (
        <ul className="grid gap-1.5">
          {away.map((a) => {
            const m = team.member(a.member_id);
            if (!m) return null;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <Avatar name={m.name} color={m.color} size="xs" />
                <span className="font-medium text-ink">{m.name}</span>
                <Badge>{ABSENCE_TYPES[a.type]}</Badge>
                <span className="num text-ink-3">{rangeLabel(a.start_date, a.end_date)}</span>
                {a.note && <span className="text-ink-3">· {a.note}</span>}
                <IconButton label="Editar ausência" size="sm" onClick={() => onOpenAbsence(a)}><Pencil className="size-4" /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AbsenceRow({ absence: a, onEdit }: { absence: Absence; onEdit: (a: Absence) => void }) {
  const { data } = useData();
  const team = useTeam();
  const m = team.member(a.member_id);
  if (!m) return null;
  const days = workdaysBetween(a.start_date, a.end_date, data.extraHolidays);
  const now = a.start_date <= data.today && a.end_date >= data.today;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
      <Avatar name={m.name} color={m.color} size="md" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm">
          <span className="num font-medium text-ink">{rangeLabel(a.start_date, a.end_date)}</span>
          <span className="text-ink-3"> · {m.name}</span>
        </p>
        {a.note && <p className="text-[13px] text-ink-3">{a.note}</p>}
      </div>
      {now && <Badge tone="success">Agora</Badge>}
      <Badge>{ABSENCE_TYPES[a.type]}</Badge>
      <span className="num text-[13px] text-ink-3">{plural(days, 'dia útil', 'dias úteis')}</span>
      <IconButton label="Editar ausência" size="sm" onClick={() => onEdit(a)}><Pencil className="size-4" /></IconButton>
    </li>
  );
}
