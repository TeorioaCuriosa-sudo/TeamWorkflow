import type { FormEvent } from 'react';
import { useState } from 'react';
import { FolderKanban, Paperclip, Plus, Tag as TagIcon } from 'lucide-react';
import { errorMessage, post } from '../api/client';
import type { Tag } from '../api/types';
import { LibraryDialog, libraryTasks, type LibraryKind } from '../features/library/LibraryDialog';
import { filesOf } from '../lib/files';
import { useData } from '../state/data';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Input, Segmented } from '../ui/Fields';
import { Card, EmptyState, PageHeader, Progress } from '../ui/misc';
import { useToast } from '../ui/Toast';

export function ProjectsPage() {
  const { data, refresh } = useData();
  const toast = useToast();
  const [kind, setKind] = useState<LibraryKind>('project');
  const [open, setOpen] = useState<{ kind: LibraryKind; id: number } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const items = kind === 'project' ? data.projects : data.topics;
  const word = kind === 'project' ? 'projeto' : 'tópico';

  async function create(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    try {
      const tag = await post<Tag>(`/api/${kind === 'project' ? 'projects' : 'topics'}`, { name: value });
      setName('');
      await refresh();
      setOpen({ kind, id: tag.id });
    } catch (ex) {
      toast.error(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Projetos"
        description="Os projetos e tópicos da equipa, com os ficheiros de cada um: briefings, imagens, vídeos, documentos."
        actions={
          <Segmented<LibraryKind>
            label="Ver projetos ou tópicos"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'project', label: <><FolderKanban className="size-4" aria-hidden />Projetos</> },
              { value: 'topic', label: <><TagIcon className="size-4" aria-hidden />Tópicos</> },
            ]}
          />
        }
      />

      <form onSubmit={(e) => void create(e)} className="flex max-w-xl gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={`Novo ${word}…`} aria-label={`Nome do novo ${word}`} />
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={busy} disabled={!name.trim()}>Criar {word}</Button>
      </form>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={kind === 'project' ? <FolderKanban /> : <TagIcon />} title={`Ainda não há ${kind === 'project' ? 'projetos' : 'tópicos'}`}>
            Cria o primeiro acima. Depois podes anexar-lhe ficheiros e usá-lo nas tarefas.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => {
            const tasks = libraryTasks(data.tasks, kind, it.id);
            const done = tasks.filter((t) => t.status === 'done').length;
            const files = filesOf(data.files, kind, it.id);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setOpen({ kind, id: it.id })}
                  aria-label={`Abrir ${word} ${it.name}`}
                  data-library-id={it.id}
                  className="grid w-full gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-pop"
                >
                  <Chip kind={kind} color={it.color} className="justify-self-start text-[13px]">{it.name}</Chip>
                  <div className="grid gap-1.5">
                    <p className="flex flex-wrap items-center justify-between gap-x-3 text-[13px] text-ink-2">
                      <span>{tasks.length ? `${done} de ${tasks.length} ${tasks.length === 1 ? 'tarefa concluída' : 'tarefas concluídas'}` : 'Sem tarefas este mês'}</span>
                      <span className="num inline-flex items-center gap-1 text-ink-3" title="Ficheiros anexados">
                        <Paperclip className="size-3.5" aria-hidden />
                        {files.length}
                      </span>
                    </p>
                    <Progress value={done} max={tasks.length} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && <LibraryDialog kind={open.kind} id={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}
