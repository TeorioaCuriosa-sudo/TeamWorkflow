// A janela de um projeto ou tópico: ficheiros, tarefas deste mês e (para comandantes) nome, cor e apagar.

import { Trash2 } from 'lucide-react';
import { del, patch } from '../../api/client';
import type { Task } from '../../api/types';
import { filesOf } from '../../lib/files';
import { TASK_STATUS } from '../../lib/labels';
import { plural } from '../../lib/text';
import { useData, useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Badge, Chip } from '../../ui/Chip';
import { ColorPicker } from '../../ui/ColorPicker';
import { CommitInput, FieldGroup } from '../../ui/Fields';
import { Modal, useConfirm } from '../../ui/Modal';
import { Attachments } from '../files/Attachments';

export type LibraryKind = 'project' | 'topic';

export const libraryTasks = (tasks: Task[], kind: LibraryKind, id: number) =>
  tasks.filter((t) => (kind === 'project' ? t.project_id === id : t.topic_ids.includes(id)));

export function LibraryDialog({ kind, id, onClose }: { kind: LibraryKind; id: number; onClose: () => void }) {
  const { data, mutate } = useData();
  const team = useTeam();
  const confirm = useConfirm();
  const { openTask } = useDialogs();
  const path = kind === 'project' ? 'projects' : 'topics';
  const word = kind === 'project' ? 'projeto' : 'tópico';
  const tag = (kind === 'project' ? data.projects : data.topics).find((t) => t.id === id);

  if (!tag) {
    return (
      <Modal title={kind === 'project' ? 'Projeto' : 'Tópico'} size="sm" onClose={onClose} footer={<><span className="flex-1" /><Button onClick={onClose}>Fechar</Button></>}>
        <p className="text-sm text-ink-2">Este {word} já não existe. Pode ter sido apagado.</p>
      </Modal>
    );
  }

  const files = filesOf(data.files, kind, id);
  const tasks = libraryTasks(data.tasks, kind, id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.title.localeCompare(b.title, 'pt'));
  const manage = team.can.manage_tags;

  async function remove() {
    if (!tag) return;
    if (!(await confirm({
      title: `Apagar ${word} “${tag.name}”?`,
      message: `As tarefas não são apagadas, só deixam de o ter. Os ${plural(files.length, 'ficheiro anexado', 'ficheiros anexados')} também são apagados.`,
      confirmLabel: 'Apagar',
      tone: 'danger',
    }))) return;
    onClose();
    await mutate(() => del(`/api/${path}/${id}`));
  }

  return (
    <Modal
      size="lg"
      title={<span className="flex items-center gap-2"><Chip kind={kind} color={tag.color} className="text-sm">{tag.name}</Chip></span>}
      subtitle={`${plural(tasks.length, 'tarefa', 'tarefas')} neste mês · ${plural(files.length, 'ficheiro', 'ficheiros')}`}
      onClose={onClose}
      footer={
        <>
          {manage && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>Apagar {word}</Button>}
          <span className="flex-1" />
          <Button onClick={onClose} data-autofocus>Fechar</Button>
        </>
      }
    >
      <div className="grid gap-6">
        {manage && (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <FieldGroup label="Nome" className="min-w-48 flex-1 basis-48">
              <CommitInput value={tag.name} maxLength={40} aria-label={`Nome do ${word}`} onCommit={(v) => void mutate(() => patch(`/api/${path}/${id}`, { name: v }))} />
            </FieldGroup>
            <FieldGroup label="Cor">
              <ColorPicker size="sm" label={`Cor do ${word}`} value={tag.color} options={data.tag_palette} onChange={(c) => void mutate(() => patch(`/api/${path}/${id}`, { color: c }))} />
            </FieldGroup>
          </div>
        )}

        <section aria-label="Ficheiros" className="grid gap-2.5">
          <h3 className="text-sm font-semibold text-ink">Ficheiros</h3>
          <Attachments owner={kind} ownerId={id} files={files} hint={`Tudo o que a equipa precisa deste ${word}: briefings, imagens, vídeos, contratos.`} />
        </section>

        <section aria-label="Tarefas deste mês" className="grid gap-2.5">
          <h3 className="text-sm font-semibold text-ink">Tarefas deste mês</h3>
          {tasks.length === 0 ? (
            <p className="text-[13px] text-ink-3">Nenhuma tarefa deste mês tem este {word}.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {tasks.map((t) => {
                const m = team.member(t.member_id);
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2">
                      {m && <Avatar name={m.name} color={m.color} size="xs" />}
                      <span className={t.status === 'done' ? 'min-w-0 flex-1 truncate text-sm text-ink-3 line-through' : 'min-w-0 flex-1 truncate text-sm text-ink'}>{t.title}</span>
                      <Badge tone={t.status === 'done' ? 'success' : t.status === 'doing' ? 'warn' : 'neutral'}>{TASK_STATUS[t.status]}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
