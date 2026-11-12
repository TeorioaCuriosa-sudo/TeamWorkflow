// A janela de uma tarefa: campos à esquerda; aprovação e atualizações à direita.

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { del, errorMessage, get, patch, post } from '../../api/client';
import type { TaskDetail } from '../../api/types';
import { dateLabel, monthLabel } from '../../lib/dates';
import { useData } from '../../state/data';
import { Button } from '../../ui/Button';
import { Modal, useConfirm } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { ActivitySection } from './Activity';
import { ApprovalSection } from './ApprovalSection';
import { TaskForm, type TaskPayload } from './TaskForm';

export function TaskDialog({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { data, version, refresh, mutate } = useData();
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

  const readOnly = task.month < data.currentMonth;

  async function save(payload: TaskPayload) {
    await patch(`/api/tasks/${taskId}`, payload);
    onClose();
    await refresh();
  }

  async function remove() {
    if (!task) return;
    if (!(await confirm({ title: 'Apagar tarefa?', message: `“${task.title}” vai ser apagada para todos. Não dá para desfazer.`, confirmLabel: 'Apagar', tone: 'danger' }))) return;
    onClose();
    await mutate(() => del(`/api/tasks/${taskId}`));
  }

  const meta = [
    `Criada em ${dateLabel(task.created_at)}`,
    task.origin_month !== task.month && `Transitada de ${monthLabel(task.origin_month)}`,
    task.recurring_id && 'Tarefa recorrente (volta todos os meses)',
    task.done_at && `Concluída em ${dateLabel(task.done_at)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      size="xl"
      title={readOnly ? 'Tarefa arquivada' : 'Tarefa'}
      subtitle={meta}
      onClose={onClose}
      footer={
        <>
          {!readOnly && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>Apagar</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly && <Button type="submit" form="task-form" variant="primary">Guardar</Button>}
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <TaskForm formId="task-form" task={task} memberId={task.member_id} readOnly={readOnly} onSubmit={save} />
        <div className="grid content-start gap-7">
          <ApprovalSection task={task} detail={detail} readOnly={readOnly} reload={load} />
          <ActivitySection
            task={task}
            detail={detail}
            readOnly={readOnly}
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

  async function create(payload: TaskPayload) {
    await post('/api/tasks', payload);
    onClose();
    await refresh();
  }

  return (
    <Modal
      title="Nova tarefa"
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-task-form" variant="primary">Criar tarefa</Button>
        </>
      }
    >
      <TaskForm formId="new-task-form" task={null} memberId={memberId} readOnly={false} onSubmit={create} />
    </Modal>
  );
}
