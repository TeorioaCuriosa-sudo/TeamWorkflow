// A janela de uma tarefa: campos à esquerda; aprovação e atualizações à direita.

import { useCallback, useEffect, useState } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '../../api/client';
import type { TaskDetail } from '../../api/types';
import { dateLabel, monthLabel } from '../../lib/dates';
import { taskAccess, type TaskAccess } from '../../lib/access';
import { useData, useTeam } from '../../state/data';
import { Attachments } from '../files/Attachments';
import { Button } from '../../ui/Button';
import { Modal, useConfirm } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { ActivitySection } from './Activity';
import { ApprovalSection } from './ApprovalSection';
import { TaskForm, type TaskPayload } from './TaskForm';

export function TaskDialog({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { data, version, refresh, mutate } = useData();
  const team = useTeam();
  const toast = useToast();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<TaskDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await get<TaskDetail>(`/api/tasks/${taskId}`));
    } catch (e) {
      // A tarefa pode ter sido apagada por outra pessoa entretanto.
      toast.error(errorMessage(e));
      onClose();
    }
  }, [taskId, toast, onClose]);

  // Carrega ao abrir e volta a carregar sempre que chegam dados novos (alguém mexeu).
  useEffect(() => { void load(); }, [load, version]);

  const task = detail?.task ?? null;
  if (!task) {
    return <Modal title="Tarefa" size="xl" onClose={onClose}><p className="py-10 text-center text-sm text-ink-3">A carregar…</p></Modal>;
  }

  const archived = task.month < data.currentMonth;
  const access: TaskAccess = archived ? 'view' : taskAccess(task, team.me);
  const readOnly = access === 'view';
  const asRequester = access === 'requester';

  async function save(payload: TaskPayload) {
    await patch(`/api/tasks/${taskId}`, payload);
    onClose();
    await refresh();
  }

  async function remove() {
    if (!task) return;
    const ask = asRequester
      ? { title: 'Retirar o pedido?', message: `“${task.title}” deixa de aparecer em Pendentes de ${team.nameOf(task.member_id)}.`, confirmLabel: 'Retirar pedido' }
      : { title: 'Apagar tarefa?', message: `“${task.title}” vai ser apagada para todos. Não dá para desfazer.`, confirmLabel: 'Apagar' };
    if (!(await confirm({ ...ask, tone: 'danger' }))) return;
    onClose();
    await mutate(() => del(`/api/tasks/${taskId}`));
  }

  const meta = [
    `Criada em ${dateLabel(task.created_at)}`,
    task.origin_month !== task.month && `Transitada de ${monthLabel(task.origin_month)}`,
    task.requested_by && task.requested_by !== task.member_id && `Pedida por ${team.nameOf(task.requested_by)}`,
    task.recurring_id && 'Tarefa recorrente (volta todos os meses)',
    task.done_at && `Concluída em ${dateLabel(task.done_at)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      size="xl"
      title={archived ? 'Tarefa arquivada' : asRequester ? 'Pedido' : 'Tarefa'}
      subtitle={meta}
      onClose={onClose}
      footer={
        <>
          {!readOnly && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>{asRequester ? 'Retirar pedido' : 'Apagar'}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly && <Button type="submit" form="task-form" variant="primary">Guardar</Button>}
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <TaskForm formId="task-form" task={task} memberId={task.member_id} access={access} onSubmit={save} />
        <div className="grid content-start gap-7">
          <ApprovalSection task={task} detail={detail} readOnly={archived} canRequest={access === 'full'} reload={load} />
          <section aria-label="Ficheiros" className="grid gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Paperclip className="size-4 text-ink-3" aria-hidden />
              Ficheiros
            </h3>
            <Attachments owner="task" ownerId={task.id} files={detail?.files ?? []} readOnly={archived} manage={task.member_id === team.me.id} hint="Documentos, imagens ou vídeos desta tarefa." />
          </section>
          <ActivitySection
            task={task}
            detail={detail}
            readOnly={archived}
            canSetStatus={access === 'full'}
            onPublished={(next) => { setDetail(next); void refresh(); }}
          />
        </div>
      </div>
    </Modal>
  );
}

/** Formulário completo de uma tarefa nova (o botão "Nova tarefa" do cabeçalho de cada pessoa). */
export function NewTaskDialog({ memberId, onClose }: { memberId: number; onClose: () => void }) {
  const { refresh } = useData();
  const team = useTeam();
  const asking = !team.isAdmin && memberId !== team.me.id;

  async function create(payload: TaskPayload) {
    await post('/api/tasks', payload);
    onClose();
    await refresh();
  }

  return (
    <Modal
      title={asking ? `Pedir tarefa a ${team.nameOf(memberId)}` : 'Nova tarefa'}
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-task-form" variant="primary">{asking ? 'Enviar pedido' : 'Criar tarefa'}</Button>
        </>
      }
    >
      <TaskForm formId="new-task-form" task={null} memberId={memberId} access="full" onSubmit={create} />
    </Modal>
  );
}
