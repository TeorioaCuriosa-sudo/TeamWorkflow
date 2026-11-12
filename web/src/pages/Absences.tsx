import { useState } from 'react';
import { CalendarOff, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import type { Absence } from '../api/types';
import { AbsenceDialog } from '../features/absences/AbsenceDialog';
import { Legend, Timeline } from '../features/absences/Timeline';
import { PresenceStrip } from '../features/people/PresenceStrip';
import { addMonths, cap, monthLabel, rangeLabel, workdaysBetween } from '../lib/dates';
import { ABSENCE_TYPES } from '../lib/labels';
import { plural } from '../lib/text';
import { useData, useTeam } from '../state/data';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { Badge } from '../ui/Chip';
import { Card, CardHeader, EmptyState, PageHeader } from '../ui/misc';

export function AbsencesPage() {
  const { data } = useData();
  const [month, setMonth] = useState(data.currentMonth);
  const [editing, setEditing] = useState<Absence | 'new' | null>(null);

  const upcoming = data.absences.filter((a) => a.end_date >= data.today);
  const past = data.absences.filter((a) => a.end_date < data.today).reverse().slice(0, 30);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Ausências"
        description="Férias, ausências e formações da equipa."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Registar ausência</Button>}
      />

      <PresenceStrip className="lg:hidden" />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <IconButton label="Mês anterior" variant="secondary" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="size-4" /></IconButton>
          <h2 className="min-w-40 text-center text-[15px] font-semibold text-ink">{cap(monthLabel(month))}</h2>
          <IconButton label="Mês seguinte" variant="secondary" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="size-4" /></IconButton>
          {month !== data.currentMonth && <Button size="sm" onClick={() => setMonth(data.currentMonth)}>Este mês</Button>}
        </div>
        <Timeline month={month} onEdit={setEditing} />
        <Legend />
      </Card>

      <Card>
        <CardHeader title="Em curso e próximas" />
        {upcoming.length ? (
          <ul className="divide-y divide-line">{upcoming.map((a) => <AbsenceRow key={a.id} absence={a} onEdit={setEditing} />)}</ul>
        ) : (
          <EmptyState icon={<CalendarOff />} title="Sem ausências marcadas" action={<Button onClick={() => setEditing('new')}>Registar ausência</Button>}>
            Quando alguém marcar férias, uma ausência ou uma formação, aparece aqui e na linha do tempo.
          </EmptyState>
        )}
      </Card>

      {past.length > 0 && (
        <Card>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[15px] font-semibold text-ink select-none">
              <ChevronRight className="size-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
              Passadas ({past.length})
            </summary>
            <ul className="divide-y divide-line border-t border-line">{past.map((a) => <AbsenceRow key={a.id} absence={a} onEdit={setEditing} />)}</ul>
          </details>
        </Card>
      )}

      {editing && <AbsenceDialog absence={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
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
