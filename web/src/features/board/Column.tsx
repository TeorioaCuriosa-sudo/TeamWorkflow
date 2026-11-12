import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { Member, Task } from '../../api/types';
import { cx } from '../../lib/cx';
import { COLUMNS, type ColumnKey } from '../../lib/labels';
import { Composer } from './Composer';
import { TaskCard } from './TaskCard';

/** Onde largar um cartão arrastado: antes de um cartão, ou no fim da coluna. */
export interface DropHint { columnId: string; beforeId: number | null }

export const columnId = (memberId: number, key: ColumnKey) => `${memberId}:${key}`;

interface ColumnProps {
  member: Member;
  columnKey: ColumnKey;
  tasks: Task[];
  readOnly: boolean;
  filtered: boolean;
  defaults: { project: number | null; topic: number | null };
  hint: DropHint | null;
}

export function Column({ member, columnKey, tasks, readOnly, filtered, defaults, hint }: ColumnProps) {
  const col = COLUMNS.find((c) => c.key === columnKey)!;
  const id = columnId(member.id, columnKey);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: readOnly });
  const [composing, setComposing] = useState(false);

  const items = columnKey === 'done' ? [...tasks].sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')) : tasks;
  const showLine = (before: number | null) => hint?.columnId === id && hint.beforeId === before && columnKey !== 'done';

  return (
    <section
      ref={setNodeRef}
      data-column={id}
      aria-label={`${col.label} de ${member.name}`}
      className={cx(
        'flex min-h-40 min-w-0 flex-col rounded-xl border border-line/70 bg-surface-2 p-2 transition-colors',
        isOver && 'border-ring/50 bg-info-soft/40',
      )}
    >
      <header className="flex items-center gap-2 px-1.5 pt-0.5 pb-2">
        <h3 className="flex-1 truncate text-[12.5px] font-semibold text-ink-2" title={col.hint}>{col.label}</h3>
        <span className="num rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-semibold text-ink-3">{items.length}</span>
      </header>

      <div className="flex flex-1 flex-col gap-2">
        {composing && (
          <Composer memberId={member.id} column={columnKey} defaults={defaults} onClose={() => setComposing(false)} />
        )}
        {items.map((t) => (
          <div key={t.id} className="grid gap-2">
            {showLine(t.id) && <DropLine />}
            <TaskCard task={t} readOnly={readOnly} />
          </div>
        ))}
        {showLine(null) && <DropLine />}
        {!items.length && !composing && (
          <p className="px-2 py-4 text-center text-xs text-ink-3">{readOnly ? 'Nenhuma' : filtered ? 'Nada com estes filtros' : 'Sem tarefas'}</p>
        )}
        {!readOnly && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            aria-label={`Nova tarefa para ${member.name} em ${col.label}`}
            className="mt-auto flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Plus className="size-4" aria-hidden />
            Nova tarefa
          </button>
        )}
      </div>
    </section>
  );
}

function DropLine() {
  return <div aria-hidden className="-my-1 h-0.5 rounded-full bg-ring" />;
}
