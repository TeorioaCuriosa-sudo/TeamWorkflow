import { useMemo, useRef, useState } from 'react';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { patch } from '../api/client';
import { ApprovalsPanel } from '../features/board/ApprovalsPanel';
import type { DropHint } from '../features/board/Column';
import { useBoardFilters } from '../features/board/filters';
import { Lane } from '../features/board/Lane';
import { CardView } from '../features/board/TaskCard';
import { PresenceStrip } from '../features/people/PresenceStrip';
import { cx } from '../lib/cx';
import { addMonths, cap, monthLabel } from '../lib/dates';
import { COLUMNS, columnOf, type ColumnKey } from '../lib/labels';
import { absenceNow } from '../lib/people';
import { useData, useTeam } from '../state/data';
import { go } from '../state/route';
import { Button, IconButton } from '../ui/Button';
import { Select } from '../ui/Fields';
import { useToast } from '../ui/Toast';

// Ao arrastar, "onde estou" decide-se pelo ponteiro; se não houver, pela sobreposição.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function WorkflowPage() {
  const { data, setBusy, patchTask, mutate } = useData();
  const team = useTeam();
  const toast = useToast();
  const filters = useBoardFilters(data);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  // O último "onde vai ficar" calculado enquanto se arrasta: ao largar, o dnd-kit já não nos dá a posição do cartão.
  const hintRef = useRef<DropHint | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  const archived = data.archived;
  const current = data.currentMonth;
  const goMonth = (m: string) => go('workflow', m === current ? null : m);

  const lanes = useMemo(
    () => data.members
      .filter((m) => (!m.removed && m.active) || (archived && data.tasks.some((t) => t.member_id === m.id)))
      .filter((m) => !filters.member || m.id === filters.member),
    [data.members, data.tasks, archived, filters.member],
  );

  const activeTask = activeId === null ? null : data.tasks.find((t) => t.id === activeId) ?? null;

  /** Dado o cartão arrastado e a coluna onde está, descobre antes de que cartão ficaria. */
  function dropTarget(e: DragMoveEvent | DragEndEvent): DropHint | null {
    if (!e.over) return null;
    const colId = String(e.over.id);
    const el = document.querySelector(`[data-column="${CSS.escape(colId)}"]`);
    const rect = e.active.rect.current.translated;
    if (!el || !rect) return { columnId: colId, beforeId: null };
    const centerY = rect.top + rect.height / 2;
    const dragged = Number(e.active.id);
    for (const card of el.querySelectorAll<HTMLElement>('[data-task-id]')) {
      const id = Number(card.dataset.taskId);
      if (id === dragged) continue;
      const r = card.getBoundingClientRect();
      if (centerY < r.top + r.height / 2) return { columnId: colId, beforeId: id };
    }
    return { columnId: colId, beforeId: null };
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
    setBusy('drag', true);
  }
  function onDragMove(e: DragMoveEvent) {
    const next = dropTarget(e);
    hintRef.current = next;
    setHint((prev) => (prev?.columnId === next?.columnId && prev?.beforeId === next?.beforeId ? prev : next));
  }
  function endDrag() {
    setActiveId(null);
    setHint(null);
    hintRef.current = null;
    setBusy('drag', false);
  }
  async function onDragEnd(e: DragEndEvent) {
    const last = hintRef.current;
    // Se o ponteiro ainda está na mesma coluna, usa a última posição calculada ao mexer.
    const target = e.over && last && last.columnId === String(e.over.id) ? last : dropTarget(e);
    endDrag();
    if (!target) return;
    const [memberStr, colKey] = target.columnId.split(':');
    await moveTask(Number(e.active.id), Number(memberStr), colKey as ColumnKey, target.beforeId);
  }

  async function moveTask(id: number, memberId: number, colKey: ColumnKey, beforeId: number | null) {
    const t = data.tasks.find((x) => x.id === id);
    const col = COLUMNS.find((c) => c.key === colKey);
    if (!t || !col) return;
    if (t.member_id === memberId && columnOf(t) === colKey && colKey === 'done') return;
    const payload = {
      member_id: memberId,
      ...col.patch,
      ...(colKey !== 'done' ? (beforeId ? { before_id: beforeId } : { to_end: true }) : {}),
    };
    const before = beforeId ? data.tasks.find((x) => x.id === beforeId) : undefined;
    patchTask(id, { member_id: memberId, ...col.patch, position: before ? before.position - 0.5 : Date.now() });
    await mutate(() => patch(`/api/tasks/${id}`, payload));
    const m = team.member(memberId);
    if (m && absenceNow(data, memberId)) toast.show(`${m.name} está ausente hoje.`);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex items-center gap-1">
          <IconButton label="Mês anterior" variant="secondary" onClick={() => goMonth(addMonths(data.month, -1))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <h1 className="min-w-44 px-2 text-center text-xl font-semibold text-ink sm:text-2xl">{cap(monthLabel(data.month))}</h1>
          <IconButton label="Mês seguinte" variant="secondary" disabled={data.month >= current} onClick={() => goMonth(addMonths(data.month, 1))}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
        {archived && <Button size="sm" onClick={() => goMonth(current)}>Este mês</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div role="group" aria-label="Filtrar por pessoa" className="scroll-hide -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterChip pressed={!filters.member} onClick={() => filters.set('member', null)}>Equipa</FilterChip>
          {team.board.map((m) => (
            <FilterChip key={m.id} pressed={filters.member === m.id} color={m.color} onClick={() => filters.set('member', m.id)}>{m.name}</FilterChip>
          ))}
        </div>
        {(data.projects.length > 0 || data.topics.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {data.projects.length > 0 && (
              <div className="w-44">
                <Select aria-label="Filtrar por projeto" value={filters.project ?? ''} onChange={(e) => filters.set('project', Number(e.target.value) || null)}>
                  <option value="">Todos os projetos</option>
                  {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            )}
            {data.topics.length > 0 && (
              <div className="w-44">
                <Select aria-label="Filtrar por tópico" value={filters.topic ?? ''} onChange={(e) => filters.set('topic', Number(e.target.value) || null)}>
                  <option value="">Todos os tópicos</option>
                  {data.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
            )}
            {filters.tagFilterActive && <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={filters.clearTags}>Limpar</Button>}
          </div>
        )}
      </div>

      {archived ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm text-info">
          <span className="flex-1">Arquivo de {monthLabel(data.month)}. Só de leitura.</span>
          <Button size="sm" onClick={() => goMonth(current)}>Voltar ao mês atual</Button>
        </div>
      ) : (
        <>
          <PresenceStrip className="lg:hidden" />
          <ApprovalsPanel />
        </>
      )}

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={endDrag}>
        <div className="grid gap-5">
          {lanes.map((m) => <Lane key={m.id} member={m} filters={filters} hint={hint} />)}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="w-64"><CardView task={activeTask} readOnly overlay /></div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function FilterChip({ pressed, color, onClick, children }: { pressed: boolean; color?: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors',
        pressed ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-3',
      )}
    >
      {color && <span aria-hidden style={{ backgroundColor: color }} className="size-2 rounded-full" />}
      {children}
    </button>
  );
}

