import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { LayoutTemplate, Plus } from 'lucide-react';
import type { Member, Task } from '../../api/types';
import { cx } from '../../lib/cx';
import { COLUMNS, type ColumnKey } from '../../lib/labels';
import { useData, useTeam } from '../../state/data';
import { Popover } from '../../ui/Popover';
import { useApplyTemplate } from '../templates/useApplyTemplate';
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
  const team = useTeam();
  // Só o administrador mexe no quadro dos outros. Aos outros, só se pede uma tarefa (vai para Pendentes).
  const mine = member.id === team.me.id;
  const canMoveHere = !readOnly && (team.isAdmin || mine);
  const canAdd = canMoveHere || (!readOnly && columnKey === 'todo');
  const requesting = !team.isAdmin && !mine;
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canMoveHere });
  const [composing, setComposing] = useState(false);

  // Ordena aqui (e não só no servidor) para que, ao largar um cartão, ele fique logo no sítio certo, sem esperar pela resposta.
  const items = columnKey === 'done'
    ? [...tasks].sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
    : [...tasks].sort((a, b) => a.position - b.position || a.id - b.id);
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
          <Composer member={member} column={columnKey} defaults={defaults} onClose={() => setComposing(false)} />
        )}
        {items.map((t) => (
          <div key={t.id} className="grid gap-2">
            {showLine(t.id) && <DropLine />}
            <TaskCard task={t} readOnly={readOnly || !(team.isAdmin || t.member_id === team.me.id)} />
          </div>
        ))}
        {showLine(null) && <DropLine />}
        {!items.length && !composing && (
          <p className="px-2 py-4 text-center text-xs text-ink-3">{readOnly ? 'Nenhuma' : filtered ? 'Nada com estes filtros' : 'Sem tarefas'}</p>
        )}
        {canAdd && !composing && (
          <div className="mt-auto flex flex-wrap items-center gap-x-1">
            <button
              type="button"
              onClick={() => setComposing(true)}
              aria-label={requesting ? `Pedir tarefa a ${member.name}` : `Nova tarefa para ${member.name} em ${col.label}`}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <Plus className="size-4" aria-hidden />
              {requesting ? 'Pedir tarefa' : 'Nova tarefa'}
            </button>
            {columnKey === 'todo' && <TemplateMenu member={member} requesting={requesting} />}
          </div>
        )}
      </div>
    </section>
  );
}

/** "Modelo": escolhe um modelo mensal ou semanal e cria logo a tarefa neste cartão. */
function TemplateMenu({ member, requesting }: { member: Member; requesting: boolean }) {
  const { data } = useData();
  const apply = useApplyTemplate();
  if (!data.templates.length) return null;
  const groups = [
    { label: 'Mensais', items: data.templates.filter((t) => t.kind === 'monthly') },
    { label: 'Semanais', items: data.templates.filter((t) => t.kind === 'weekly') },
  ].filter((g) => g.items.length);

  return (
    <Popover
      floating
      align="start"
      label={`Modelos para ${member.name}`}
      panelClassName="w-64 p-1.5"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={requesting ? `Pedir um modelo a ${member.name}` : `Aplicar um modelo no cartão de ${member.name}`}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <LayoutTemplate className="size-4" aria-hidden />
          Modelo
        </button>
      )}
    >
      {({ close }) => (
        <div role="menu" className="grid gap-1">
          {groups.map((g) => (
            <div key={g.label} className="grid">
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{g.label}</p>
              {g.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => { close(); void apply(t, member.id); }}
                  className="rounded-lg px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-3"
                >
                  <span className="line-clamp-2">{t.title}</span>
                </button>
              ))}
            </div>
          ))}
          <p className="px-2.5 pt-1 pb-1 text-xs text-ink-3">{requesting ? `Vai como pedido a ${member.name}.` : 'A tarefa fica logo neste cartão.'}</p>
        </div>
      )}
    </Popover>
  );
}

function DropLine() {
  return <div aria-hidden className="-my-1 h-0.5 rounded-full bg-ring" />;
}
