import { useState } from 'react';
import type { FormEvent } from 'react';
import { Folder, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { del, patch, post } from '../../api/client';
import type { Tag } from '../../api/types';
import { useData } from '../../state/data';
import { Button, IconButton } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ColorPicker } from '../../ui/ColorPicker';
import { CommitInput, Input } from '../../ui/Fields';
import { useConfirm } from '../../ui/Modal';
import { SettingsSection } from './SettingsSection';

function TagBlock({ kind, items, singular, plural }: { kind: 'topics' | 'projects'; items: Tag[]; singular: string; plural: string }) {
  const { data, mutate } = useData();
  const confirm = useConfirm();
  const [name, setName] = useState('');

  function add(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setName('');
    void mutate(() => post(`/api/${kind}`, { name: value }));
  }

  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {kind === 'topics' ? <TagIcon className="size-4 text-ink-3" aria-hidden /> : <Folder className="size-4 text-ink-3" aria-hidden />}
        {plural}
      </h3>
      {items.length === 0 && <p className="text-[13px] text-ink-3">Ainda não há {plural.toLowerCase()}.</p>}
      <ul className="grid gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <Chip kind={kind === 'topics' ? 'topic' : 'project'} color={it.color} className="shrink-0">{it.name}</Chip>
            <CommitInput className="min-w-36 flex-1 basis-36" value={it.name} maxLength={40} aria-label={`Nome de ${it.name}`} onCommit={(v) => void mutate(() => patch(`/api/${kind}/${it.id}`, { name: v }))} />
            <ColorPicker size="sm" label={`Cor de ${it.name}`} value={it.color} options={data.tag_palette} onChange={(c) => void mutate(() => patch(`/api/${kind}/${it.id}`, { color: c }))} />
            <IconButton
              label={`Apagar ${it.name}`}
              size="sm"
              onClick={async () => {
                if (await confirm({ title: `Apagar ${singular} “${it.name}”?`, message: 'As tarefas não são apagadas, só deixam de o ter.', confirmLabel: 'Apagar', tone: 'danger' })) {
                  await mutate(() => del(`/api/${kind}/${it.id}`));
                }
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={`Novo ${singular}…`} aria-label={`Nome do novo ${singular}`} />
        <Button type="submit" icon={<Plus className="size-4" />} disabled={!name.trim()}>Adicionar</Button>
      </form>
    </div>
  );
}

export function TagsSection() {
  const { data } = useData();
  return (
    <SettingsSection
      title="Tópicos e projetos"
      hint="Os tópicos são etiquetas coloridas (cada tarefa pode ter várias). Os projetos agrupam tarefas (cada tarefa tem no máximo um). Ambos servem para filtrar o quadro."
    >
      <TagBlock kind="topics" items={data.topics} singular="tópico" plural="Tópicos" />
      <div className="h-px bg-line" />
      <TagBlock kind="projects" items={data.projects} singular="projeto" plural="Projetos" />
    </SettingsSection>
  );
}
