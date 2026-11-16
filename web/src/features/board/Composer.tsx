import type { FormEvent } from 'react';
import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { post } from '../../api/client';
import type { Member, Urgency } from '../../api/types';
import { cx } from '../../lib/cx';
import type { ColumnKey } from '../../lib/labels';
import { URGENCY_KEYS, URGENCY_LABEL } from '../../lib/labels';
import { useData, useTeam } from '../../state/data';
import { Button, IconButton } from '../../ui/Button';
import { Input, Select } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { TopicPicker } from '../task/TagPickers';

/** Caixa para escrever o título de uma tarefa nova diretamente numa coluna (ou um pedido, no cartão de outra pessoa). */
export function Composer({ member, column, defaults, onClose }: {
  member: Member;
  column: ColumnKey;
  /** Projeto/tópico dos filtros ativos: a tarefa nova já entra neles. */
  defaults: { project: number | null; topic: number | null };
  onClose: () => void;
}) {
  const { data, mutate } = useData();
  const team = useTeam();
  const toast = useToast();
  const request = member.id !== team.me.id && !team.isAdmin;
  const [title, setTitle] = useState('');
  const [project, setProject] = useState<number | null>(defaults.project);
  const [topics, setTopics] = useState<number[]>(defaults.topic ? [defaults.topic] : []);
  const [urgency, setUrgency] = useState<Urgency>('normal');
  const [more, setMore] = useState(Boolean(defaults.project || defaults.topic));

  const placeholder = request
    ? `O que precisas que ${member.name} faça?…`
    : column === 'doing' ? 'O que estás a fazer?…' : column === 'done' ? 'O que já ficou feito?…' : 'Nova tarefa…';

  const summary = [
    project && team.project(project)?.name,
    topics.length > 0 && `${topics.length} ${topics.length === 1 ? 'tópico' : 'tópicos'}`,
    urgency !== 'normal' && URGENCY_LABEL[urgency],
  ].filter(Boolean).join(' · ');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    onClose();
    const ok = await mutate(() => post('/api/tasks', {
      member_id: member.id,
      title: text,
      status: column,
      project_id: project,
      topic_ids: topics,
      urgency,
    }));
    if (ok && request) toast.success(`Pedido enviado a ${member.name}.`);
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 rounded-xl border border-ring/40 bg-surface p-2.5 shadow-card"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoComplete="off"
        aria-label={request ? `Pedido para ${member.name}` : 'Título da nova tarefa'}
        placeholder={placeholder}
      />
      <button
        type="button"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
        className="flex min-h-7 items-center gap-1.5 rounded-md px-1 text-left text-xs font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <ChevronDown aria-hidden className={cx('size-3.5 shrink-0 transition-transform', more && 'rotate-180')} />
        <span className="truncate">{more ? 'Projeto, tópicos e urgência' : summary || 'Projeto, tópicos e urgência'}</span>
      </button>
      {more && (
        <div className="grid gap-2.5">
          <Select aria-label="Projeto" value={project ?? ''} onChange={(e) => setProject(Number(e.target.value) || null)} className="h-8 text-[13px]">
            <option value="">Sem projeto</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {data.topics.length > 0 && <TopicPicker allowCreate={false} value={topics} onChange={setTopics} />}
          <Select aria-label="Urgência" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} className="h-8 text-[13px]">
            {URGENCY_KEYS.map((k) => <option key={k} value={k}>{URGENCY_LABEL[k]}</option>)}
          </Select>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Button type="submit" variant="primary" size="sm" disabled={!title.trim()}>{request ? 'Pedir' : 'Adicionar'}</Button>
        <IconButton label="Fechar (Esc)" size="sm" onClick={onClose}><X className="size-4" /></IconButton>
      </div>
    </form>
  );
}
