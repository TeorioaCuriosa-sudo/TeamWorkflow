import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import type { Task, TaskKind, TaskStatus, Urgency } from '../../api/types';
import type { TaskAccess } from '../../lib/access';
import { TASK_STATUS, URGENCY_KEYS, URGENCY_LABEL } from '../../lib/labels';
import { useData, useTeam } from '../../state/data';
import { Field, FieldGroup, Input, Select, Switch, Textarea } from '../../ui/Fields';
import { FormError } from '../../ui/misc';
import { ProjectPicker, TopicPicker } from './TagPickers';

export interface TaskPayload {
  title: string;
  notes: string;
  member_id: number;
  status?: TaskStatus;
  kind?: TaskKind;
  due: string | null;
  urgency: Urgency;
  project_id: number | null;
  topic_ids: number[];
  repeat?: boolean;
  apply_to_recurring?: boolean;
}

interface TaskFormProps {
  formId: string;
  /** null = tarefa nova. */
  task: Task | null;
  /** Pessoa a quem a tarefa nova fica atribuída. */
  memberId: number;
  /** O que posso fazer: tudo, só corrigir um pedido meu, ou apenas ver. Numa tarefa nova usa-se 'full'. */
  access: TaskAccess;
  onSubmit: (payload: TaskPayload) => Promise<void>;
}

/** Os campos de uma tarefa (a mesma janela serve para criar e para editar). */
export function TaskForm({ formId, task, memberId, access, onSubmit }: TaskFormProps) {
  const { data } = useData();
  const team = useTeam();
  const isNew = !task;
  const readOnly = access === 'view';

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [who, setWho] = useState(task?.member_id ?? memberId);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? 'flex');
  const [due, setDue] = useState(task?.due ?? '');
  const [urgency, setUrgency] = useState<Urgency>(task?.urgency ?? 'normal');
  const [project, setProject] = useState<number | null>(task?.project_id ?? null);
  const [topics, setTopics] = useState<number[]>(task?.topic_ids ?? []);
  const [repeat, setRepeat] = useState(false);
  const [applyRecurring, setApplyRecurring] = useState(false);
  const [error, setError] = useState('');

  // Se o estado mudou por fora (uma atualização publicada ao lado), acompanha.
  const serverStatus = task?.status;
  useEffect(() => { if (serverStatus) setStatus(serverStatus); }, [serverStatus]);

  const people = data.members.filter((m) => !m.removed && (m.active || m.id === task?.member_id) || m.id === task?.member_id);
  // Numa tarefa nova para outra pessoa, ou ao corrigir um pedido meu, o que se cria é um pedido.
  const requestMode = access === 'requester' || (isNew && !team.isAdmin && who !== team.me.id);
  const whoName = team.nameOf(who);
  // Quem tem a tarefa só a passa a outra pessoa se for administrador.
  const whoLocked = readOnly || (!isNew && access === 'full' && !team.isAdmin);
  const showStatusKind = !requestMode;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('O título é obrigatório.'); return; }
    try {
      await onSubmit({
        title, notes, member_id: who, due: due || null, urgency, project_id: project, topic_ids: topics,
        ...(showStatusKind ? { status, kind } : {}),
        ...(isNew ? (showStatusKind ? { repeat: kind === 'monthly' && repeat } : {}) : showStatusKind ? { apply_to_recurring: applyRecurring } : {}),
      });
    } catch (ex) {
      setError(errorMessage(ex));
    }
  }

  return (
    <form id={formId} onSubmit={submit} className="grid content-start gap-4 sm:grid-cols-2">
      <Field label="Título" className="sm:col-span-2">
        <Input data-autofocus={isNew || undefined} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required disabled={readOnly} />
      </Field>
      <Field label="Notas" className="sm:col-span-2">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} disabled={readOnly} placeholder="Detalhes, links, o que falta fazer…" />
      </Field>
      <Field label={requestMode ? 'Pedir a' : 'Pessoa'}>
        <Select value={who} onChange={(e) => setWho(Number(e.target.value))} disabled={whoLocked}>
          {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Urgência">
        <Select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} disabled={readOnly}>
          {URGENCY_KEYS.map((k) => <option key={k} value={k}>{URGENCY_LABEL[k]}</option>)}
        </Select>
      </Field>
      {showStatusKind && (
        <>
          <Field label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={readOnly}>
              {(Object.keys(TASK_STATUS) as TaskStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS[k]}</option>)}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)} disabled={readOnly}>
              <option value="flex">Semanal / diária</option>
              <option value="monthly">Mensal</option>
            </Select>
          </Field>
        </>
      )}
      <Field label="Prazo (opcional)">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={readOnly} />
      </Field>
      {requestMode && (
        <p className="text-[13px] leading-relaxed text-ink-3 sm:col-span-2">
          Fica em Pendentes de {whoName}, que decide o que fazer. Podes corrigir ou retirar o pedido até {whoName} lhe pegar.
        </p>
      )}
      <FieldGroup label="Projeto" className="sm:col-span-2">
        <ProjectPicker value={project} onChange={setProject} disabled={readOnly} />
      </FieldGroup>
      <FieldGroup label="Tópicos" className="sm:col-span-2">
        <TopicPicker value={topics} onChange={setTopics} disabled={readOnly} />
      </FieldGroup>
      {isNew && showStatusKind && kind === 'monthly' && (
        <Switch className="sm:col-span-2" checked={repeat} onChange={setRepeat} label="Repetir todos os meses" />
      )}
      {!isNew && access === 'full' && task.recurring_id && (
        <Switch
          className="sm:col-span-2"
          checked={applyRecurring}
          onChange={setApplyRecurring}
          label="Guardar o projeto e os tópicos também na tarefa recorrente"
          hint="Passam a valer para os próximos meses."
        />
      )}
      <div className="sm:col-span-2"><FormError>{error}</FormError></div>
    </form>
  );
}
