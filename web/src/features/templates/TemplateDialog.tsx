// Criar, ver ou alterar um modelo de tarefa. Depois de criado, a janela fica aberta para se anexarem ficheiros.

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { del, errorMessage, patch, post } from '../../api/client';
import type { TaskTemplate, Urgency } from '../../api/types';
import { filesOf } from '../../lib/files';
import { URGENCY_KEYS, URGENCY_LABEL } from '../../lib/labels';
import { useData, useTeam } from '../../state/data';
import { Button } from '../../ui/Button';
import { Field, FieldGroup, Input, Segmented, Select, Textarea } from '../../ui/Fields';
import { Modal, useConfirm } from '../../ui/Modal';
import { FormError } from '../../ui/misc';
import { useToast } from '../../ui/Toast';
import { Attachments } from '../files/Attachments';
import { ProjectPicker, TopicPicker } from '../task/TagPickers';

type Kind = TaskTemplate['kind'];

export const canChangeTemplate = (t: Pick<TaskTemplate, 'created_by'>, me: { id: number }, manage: boolean) => t.created_by === me.id || manage;

export function TemplateDialog({ template, kind: defaultKind, onClose }: { template: TaskTemplate | null; kind: Kind; onClose: () => void }) {
  const { data, refresh, mutate } = useData();
  const team = useTeam();
  const toast = useToast();
  const confirm = useConfirm();

  // Depois de criar, passa a editar o modelo acabado de nascer (para poder anexar-lhe ficheiros).
  const [currentId, setCurrentId] = useState<number | null>(template?.id ?? null);
  const live = currentId === null ? null : data.templates.find((t) => t.id === currentId) ?? null;
  const seed = live ?? template;

  const [title, setTitle] = useState(seed?.title ?? '');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [kind, setKind] = useState<Kind>(seed?.kind ?? defaultKind);
  const [urgency, setUrgency] = useState<Urgency>(seed?.urgency ?? 'normal');
  const [project, setProject] = useState<number | null>(seed?.project_id ?? null);
  const [topics, setTopics] = useState<number[]>(seed?.topic_ids ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (currentId !== null && !live) {
    return (
      <Modal title="Modelo" size="sm" onClose={onClose} footer={<><span className="flex-1" /><Button onClick={onClose}>Fechar</Button></>}>
        <p className="text-sm text-ink-2">Este modelo já não existe. Pode ter sido apagado.</p>
      </Modal>
    );
  }

  const editable = live ? canChangeTemplate(live, team.me, team.can.manage_tags) : true;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('O título é obrigatório.'); return; }
    setBusy(true);
    const payload = { title, notes, kind, urgency, project_id: project, topic_ids: topics };
    try {
      if (live) {
        await patch(`/api/templates/${live.id}`, payload);
        toast.success('Modelo guardado.');
        onClose();
      } else {
        const created = await post<TaskTemplate>('/api/templates', payload);
        setCurrentId(created.id);
        toast.success('Modelo criado. Já podes anexar ficheiros.');
      }
      await refresh();
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!live) return;
    if (!(await confirm({
      title: 'Apagar modelo?',
      message: `“${live.title}” e os seus ficheiros são apagados. As tarefas que já criaste com ele não mudam.`,
      confirmLabel: 'Apagar',
      tone: 'danger',
    }))) return;
    onClose();
    await mutate(() => del(`/api/templates/${live.id}`));
  }

  return (
    <Modal
      size="lg"
      title={live ? 'Modelo de tarefa' : 'Novo modelo de tarefa'}
      subtitle={live && !editable ? `Criado por ${team.nameOf(live.created_by)}. Só quem o criou e os comandantes o alteram.` : 'Guarda uma vez e aplica com um clique no cartão de quem vai fazer.'}
      onClose={onClose}
      footer={
        <>
          {live && editable && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>Apagar</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>{live && !editable ? 'Fechar' : 'Cancelar'}</Button>
          {editable && <Button type="submit" form="template-form" variant="primary" loading={busy}>{live ? 'Guardar' : 'Criar modelo'}</Button>}
        </>
      }
    >
      <div className="grid gap-6">
        <form id="template-form" onSubmit={(e) => void submit(e)} className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Título" className="sm:col-span-2">
            <Input data-autofocus={!live || undefined} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required disabled={!editable} placeholder="Por exemplo, relatório mensal de redes sociais" />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} disabled={!editable} placeholder="O que fazer, links, critérios…" />
          </Field>
          <FieldGroup label="Repete-se">
            <Segmented<Kind>
              label="Tipo de modelo"
              value={kind}
              onChange={setKind}
              className={editable ? undefined : 'pointer-events-none opacity-60'}
              options={[{ value: 'monthly', label: 'Todos os meses' }, { value: 'weekly', label: 'Todas as semanas' }]}
            />
          </FieldGroup>
          <Field label="Urgência">
            <Select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} disabled={!editable}>
              {URGENCY_KEYS.map((k) => <option key={k} value={k}>{URGENCY_LABEL[k]}</option>)}
            </Select>
          </Field>
          <FieldGroup label="Projeto" className="sm:col-span-2">
            <ProjectPicker value={project} onChange={setProject} disabled={!editable} />
          </FieldGroup>
          <FieldGroup label="Tópicos" className="sm:col-span-2">
            <TopicPicker value={topics} onChange={setTopics} disabled={!editable} />
          </FieldGroup>
          <p className="text-xs leading-relaxed text-ink-3 sm:col-span-2">
            {kind === 'monthly' ? 'Mensal' : 'Semanal'}: quando o aplicas, a tarefa nasce no cartão da pessoa como {kind === 'monthly' ? 'tarefa mensal' : 'tarefa semanal ou diária'}, em Pendentes. As tarefas que se repetem sozinhas todos os meses continuam nas Definições.
          </p>
          <div className="sm:col-span-2"><FormError>{error}</FormError></div>
        </form>

        <section aria-label="Ficheiros do modelo" className="grid gap-2.5">
          <h3 className="text-sm font-semibold text-ink">Ficheiros</h3>
          {live ? (
            <Attachments owner="template" ownerId={live.id} files={filesOf(data.files, 'template', live.id)} hint="Seguem copiados para cada tarefa criada com este modelo." />
          ) : (
            <p className="text-[13px] text-ink-3">Cria o modelo para lhe poderes anexar ficheiros. Cada tarefa criada com ele recebe uma cópia.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

