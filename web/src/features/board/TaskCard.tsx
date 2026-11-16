import type { KeyboardEvent, ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Check, Clock, CornerDownRight, FileText, HandHelping, MessageSquare, Paperclip, Play, Repeat, Undo2 } from 'lucide-react';
import { patch } from '../../api/client';
import type { Task, TaskStatus } from '../../api/types';
import { cx } from '../../lib/cx';
import { dayLabel, monthLabel, monthShort } from '../../lib/dates';
import { useData, useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { Badge, Chip, UrgencyBadge } from '../../ui/Chip';

function ApprovalBadge({ task }: { task: Task }) {
  const team = useTeam();
  const a = task.approval;
  if (!a) return null;
  const who = team.nameOf(a.approver_id);
  if (a.status === 'pending') return <Badge tone="warn" icon={<Clock className="size-3" />}>À espera de {who}</Badge>;
  if (a.status === 'approved') return <Badge tone="success" icon={<Check className="size-3" />}>Aprovada</Badge>;
  if (a.status === 'rejected') return <Badge tone="danger">Rejeitada</Badge>;
  return null;
}

function Meta({ icon, children, title, className }: { icon: ReactNode; children?: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx('num inline-flex items-center gap-1 text-xs', className)}>
      <span aria-hidden className="grid place-items-center [&>svg]:size-3.5">{icon}</span>
      {children}
    </span>
  );
}

/** Cartão que se pode arrastar. */
export function TaskCard({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const drag = useDraggable({ id: task.id, disabled: readOnly });
  return <CardView task={task} readOnly={readOnly} drag={drag} />;
}

type DragApi = ReturnType<typeof useDraggable>;

/**
 * O desenho do cartão. É separado de TaskCard porque o cartão "fantasma" que acompanha o rato
 * ao arrastar (overlay) usa o mesmo desenho, mas não pode registar-se como arrastável outra vez.
 */
export function CardView({ task: t, readOnly, drag, overlay }: { task: Task; readOnly: boolean; drag?: DragApi; overlay?: boolean }) {
  const { data, mutate, patchTask } = useData();
  const team = useTeam();
  const { openTask } = useDialogs();
  const attributes = drag?.attributes;
  const listeners = drag?.listeners;
  const isDragging = drag?.isDragging ?? false;

  const late = Boolean(t.due && t.status !== 'done' && t.due < data.today);
  const project = team.project(t.project_id);
  const topics = t.topic_ids.map((id) => team.topic(id)).filter((x) => x !== undefined);

  async function setStatus(status: TaskStatus) {
    patchTask(t.id, { status });
    await mutate(() => patch(`/api/tasks/${t.id}`, { status }));
  }

  const actions: Array<{ label: string; icon: ReactNode; status: TaskStatus }> = readOnly
    ? []
    : t.status === 'todo'
      ? [{ label: 'Iniciar', icon: <Play />, status: 'doing' }, { label: 'Concluir', icon: <Check />, status: 'done' }]
      : t.status === 'doing'
        ? [{ label: 'Voltar a por fazer', icon: <Undo2 />, status: 'todo' }, { label: 'Concluir', icon: <Check />, status: 'done' }]
        : [{ label: 'Reabrir', icon: <Undo2 />, status: 'todo' }];

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Enter abre a tarefa; Espaço pega no cartão para o mover com o teclado (tratado pelo dnd-kit).
    if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); openTask(t.id); return; }
    (listeners?.onKeyDown as ((e: KeyboardEvent<HTMLElement>) => void) | undefined)?.(e);
  };

  // Em Pendentes, mostra quem pediu a tarefa (se não foi a própria pessoa).
  const requestedBy = t.status === 'todo' && t.requested_by && t.requested_by !== t.member_id ? team.nameOf(t.requested_by) : null;
  const comment = t.last_comment ? `${team.nameOf(t.last_comment.member_id)}: ${t.last_comment.text}` : 'Atualizações';

  return (
    <article
      ref={drag?.setNodeRef}
      data-task-id={t.id}
      {...attributes}
      {...listeners}
      // Mesmo sem arrastar (mês arquivado), o cartão abre-se: não o anunciar como desativado nem como "arrastável".
      aria-disabled={undefined}
      aria-roledescription={readOnly ? undefined : attributes?.['aria-roledescription']}
      onKeyDown={onKeyDown}
      onClick={() => { if (!overlay) openTask(t.id); }}
      aria-label={`${t.title}. Abrir detalhes`}
      className={cx(
        'group relative rounded-xl border bg-surface p-3 pl-3.5 text-left shadow-card transition-[box-shadow,border-color,opacity]',
        'before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-full',
        t.status === 'doing' && 'before:bg-warn',
        t.status === 'done' && 'before:bg-success',
        late && 'before:bg-danger',
        late ? 'border-danger/35' : 'border-line',
        !readOnly && 'cursor-grab touch-manipulation hover:border-line-strong hover:shadow-pop active:cursor-grabbing',
        readOnly && 'cursor-pointer hover:border-line-strong',
        isDragging && 'opacity-30',
        overlay && 'rotate-1 cursor-grabbing shadow-pop ring-2 ring-ring/40',
      )}
    >
      {(project || topics.length > 0) && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {project && <Chip kind="project" color={project.color} title={`Projeto: ${project.name}`}>{project.name}</Chip>}
          {topics.map((tp) => <Chip key={tp.id} color={tp.color} title={`Tópico: ${tp.name}`}>{tp.name}</Chip>)}
        </div>
      )}

      <p className={cx('text-[13.5px] leading-snug font-medium break-words', t.status === 'done' ? 'text-ink-2' : 'text-ink')}>{t.title}</p>

      {(t.urgency !== 'normal' || requestedBy) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <UrgencyBadge urgency={t.urgency} />
          {requestedBy && (
            <Badge icon={<HandHelping aria-hidden className="size-3" />} className="max-w-full" >
              <span className="truncate">Pedido por {requestedBy}</span>
            </Badge>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ink-3 empty:hidden">
        <ApprovalBadge task={t} />
        {t.recurring_id && <Meta icon={<Repeat />} title="Repete todos os meses">Mensal</Meta>}
        {t.due && <Meta icon={<Clock />} title={late ? 'Prazo ultrapassado' : 'Prazo'} className={late ? 'font-medium text-danger' : undefined}>{dayLabel(t.due)}</Meta>}
        {t.origin_month !== t.month && (
          <Meta icon={<CornerDownRight />} title={`Criada em ${monthLabel(t.origin_month)}`}>de {monthShort(t.origin_month)}</Meta>
        )}
        {t.status === 'done' && t.done_at && <Meta icon={<Check />} title="Concluída" className="text-success">{dayLabel(t.done_at.slice(0, 10))}</Meta>}
        {t.comments > 0 && <Meta icon={<MessageSquare />} title={comment}>{t.comments}</Meta>}
        {t.file_count > 0 && <Meta icon={<Paperclip />} title={t.file_count === 1 ? '1 ficheiro anexado' : `${t.file_count} ficheiros anexados`}>{t.file_count}</Meta>}
        {t.notes && <Meta icon={<FileText />} title="Tem notas" />}
      </div>

      {actions.length > 0 && !overlay && (
        <div
          className={cx(
            'flex gap-0.5 rounded-lg bg-surface p-0.5 shadow-sm ring-1 ring-line transition-opacity',
            'absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            'pointer-coarse:static pointer-coarse:mt-2 pointer-coarse:justify-end pointer-coarse:opacity-100 pointer-coarse:shadow-none pointer-coarse:ring-0',
          )}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              title={a.label}
              aria-label={`${a.label}: ${t.title}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); void setStatus(a.status); }}
              className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink [&>svg]:size-4"
            >
              {a.icon}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
