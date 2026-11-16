import { useState } from 'react';
import { Plus } from 'lucide-react';
import { errorMessage, post } from '../../api/client';
import type { Tag } from '../../api/types';
import { cx, vars } from '../../lib/cx';
import { useData, useTeam } from '../../state/data';
import { Button } from '../../ui/Button';
import { Input, Select } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

/** Criar um tópico ou projeto novo sem sair do que se está a fazer. */
function useCreateTag(kind: 'topics' | 'projects') {
  const { refresh } = useData();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(): Promise<Tag | null> {
    const value = name.trim();
    if (!value) return null;
    setBusy(true);
    try {
      const tag = await post<Tag>(`/api/${kind}`, { name: value });
      setName('');
      await refresh();
      return tag;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { name, setName, busy, create };
}

export function TopicPicker({ value, onChange, disabled, allowCreate = true }: { value: number[]; onChange: (ids: number[]) => void; disabled?: boolean; allowCreate?: boolean }) {
  const { data } = useData();
  const team = useTeam();
  const creator = useCreateTag('topics');
  const canCreate = allowCreate && team.can.create_tags;
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  async function add() {
    const tag = await creator.create();
    if (tag) onChange([...value, tag.id]);
  }

  return (
    <div className="grid gap-2">
      <div role="group" aria-label="Tópicos" className="flex flex-wrap gap-1.5">
        {data.topics.map((tp) => {
          const on = value.includes(tp.id);
          return (
            <button
              key={tp.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(tp.id)}
              style={vars({ '--c': tp.color })}
              className={cx(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:cursor-default',
                on ? 'tint border-[var(--c)]' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-3',
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--c)]" />
              {tp.name}
            </button>
          );
        })}
        {!data.topics.length && <span className="text-[13px] text-ink-3">{canCreate ? 'Ainda não há tópicos. Cria o primeiro abaixo.' : 'Ainda não há tópicos.'}</span>}
      </div>
      {!disabled && canCreate && (
        <div className="flex gap-2">
          <Input
            value={creator.name}
            onChange={(e) => creator.setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            maxLength={40}
            placeholder="Novo tópico…"
            aria-label="Nome do novo tópico"
            className="h-8 text-[13px]"
          />
          <Button size="sm" icon={<Plus className="size-4" />} loading={creator.busy} disabled={!creator.name.trim()} onClick={() => void add()}>Criar</Button>
        </div>
      )}
    </div>
  );
}

export function ProjectPicker({ value, onChange, disabled }: { value: number | null; onChange: (id: number | null) => void; disabled?: boolean }) {
  const { data } = useData();
  const team = useTeam();
  const creator = useCreateTag('projects');

  async function add() {
    const tag = await creator.create();
    if (tag) onChange(tag.id);
  }

  return (
    <div className="grid gap-2">
      <Select aria-label="Projeto" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(Number(e.target.value) || null)}>
        <option value="">Sem projeto</option>
        {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      {!disabled && team.can.create_tags && (
        <div className="flex gap-2">
          <Input
            value={creator.name}
            onChange={(e) => creator.setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
            maxLength={40}
            placeholder="Novo projeto…"
            aria-label="Nome do novo projeto"
            className="h-8 text-[13px]"
          />
          <Button size="sm" icon={<Plus className="size-4" />} loading={creator.busy} disabled={!creator.name.trim()} onClick={() => void add()}>Criar</Button>
        </div>
      )}
    </div>
  );
}
