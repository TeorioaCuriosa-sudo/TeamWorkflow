import { Plus } from 'lucide-react';
import type { Member } from '../../api/types';
import { cx } from '../../lib/cx';
import { COLUMNS } from '../../lib/labels';
import { personState, STATUS_DOT } from '../../lib/people';
import { useData, useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { PersonAvatar } from '../people/PersonAvatar';
import { Button } from '../../ui/Button';
import { Card, Progress } from '../../ui/misc';
import { Column, type DropHint } from './Column';
import type { BoardFilters } from './filters';

export function StatusPill({ member }: { member: Member }) {
  const { data } = useData();
  const st = personState(member, data);
  if (st.key === 'available' && !st.text) return null;
  const label = st.key === 'away' ? st.label : st.text ? `${st.label} · ${st.text}` : st.label;
  return (
    <span title={label} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-0.5 text-xs text-ink-2">
      <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', STATUS_DOT[st.key])} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** A faixa de uma pessoa: cabeçalho com progresso e as três colunas. */
export function Lane({ member, filters, hint }: { member: Member; filters: BoardFilters; hint: DropHint | null }) {
  const { data } = useData();
  const team = useTeam();
  const { openNewTask } = useDialogs();
  const requesting = !team.isAdmin && member.id !== team.me.id;
  const mine = data.tasks.filter((t) => t.member_id === member.id);
  const done = mine.filter((t) => t.status === 'done').length;
  const visible = mine.filter(filters.passes);

  return (
    <Card aria-label={`Tarefas de ${member.name}`} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar member={member} size="lg" online={data.archived ? undefined : member.online} />
          <div className="min-w-0 leading-tight">
            <h2 className="truncate text-[15px] font-semibold text-ink">{member.name}</h2>
            <p className="num mt-0.5 text-xs text-ink-3">{done} de {mine.length} concluídas</p>
          </div>
        </div>
        {!data.archived && <StatusPill member={member} />}
        <div className="ml-auto flex items-center gap-4">
          <Progress value={done} max={mine.length} className="hidden w-40 sm:block" />
          {!data.archived && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openNewTask(member.id)}>{requesting ? 'Pedir tarefa' : 'Nova tarefa'}</Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 border-t border-line p-3 md:grid-cols-3">
        {COLUMNS.map((c) => (
          <Column
            key={c.key}
            member={member}
            columnKey={c.key}
            tasks={visible.filter((t) => t.status === c.key)}
            readOnly={data.archived}
            filtered={filters.tagFilterActive}
            defaults={{ project: filters.project, topic: filters.topic }}
            hint={hint}
          />
        ))}
      </div>
    </Card>
  );
}
