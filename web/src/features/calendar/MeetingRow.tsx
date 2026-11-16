import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Chip';
import type { Meeting } from '../../api/types';
import { cx } from '../../lib/cx';
import { monthShort } from '../../lib/dates';
import { isLive, providerOf, timeRange } from '../../lib/meetings';
import { useData, useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { JoinButton } from './MeetingDialog';

/** Até quatro participantes, sobrepostos, e quantos mais há. */
function AttendeeStack({ ids }: { ids: number[] }) {
  const team = useTeam();
  const people = ids.map((id) => team.member(id)).filter((m) => m !== undefined);
  if (!people.length) return null;
  return (
    <span className="flex items-center" aria-label={`${people.length} participantes: ${people.map((m) => m.name).join(', ')}`}>
      <span className="flex -space-x-1.5">
        {people.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} color={m.color} size="sm" ringClass="ring-surface" className="rounded-full ring-2 ring-surface" />)}
      </span>
      {people.length > 4 && <span className="num ml-1.5 text-xs text-ink-3">+{people.length - 4}</span>}
    </span>
  );
}

/** Uma reunião numa lista: quando é, quem vai e, se houver link, o botão para entrar. */
export function MeetingRow({ meeting: m, compact = false }: { meeting: Meeting; compact?: boolean }) {
  const { data } = useData();
  const { openMeeting } = useDialogs();
  const live = isLive(m, data.today);
  const provider = providerOf(m.link);

  return (
    <li className={cx('flex flex-wrap items-center gap-x-3 gap-y-2', compact ? 'py-2.5' : 'px-5 py-3')}>
      {!compact && (
        <span aria-hidden className="grid w-12 shrink-0 place-items-center rounded-lg bg-surface-3 py-1 text-center leading-tight">
          <span className="text-[11px] font-medium text-ink-3 uppercase">{monthShort(m.date.slice(0, 7))}</span>
          <span className="num text-base font-semibold text-ink">{Number(m.date.slice(8))}</span>
        </span>
      )}
      <button type="button" onClick={() => openMeeting(m.id)} className="min-w-0 flex-1 basis-48 rounded-md text-left">
        <span className="block truncate text-sm font-medium text-ink">{m.title}</span>
        <span className="num block truncate text-[13px] text-ink-3">
          {timeRange(m)}{provider ? ` · ${provider}` : m.link ? ' · Videochamada' : ''}
        </span>
      </button>
      <AttendeeStack ids={m.attendee_ids} />
      {live && <Badge tone="success">A decorrer</Badge>}
      {!live && m.date === data.today && <Badge tone="info">Hoje</Badge>}
      {m.link && <JoinButton meeting={m} size="sm" variant={live ? 'primary' : 'secondary'} />}
    </li>
  );
}
