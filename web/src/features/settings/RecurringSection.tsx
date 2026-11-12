import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Repeat, Trash2 } from 'lucide-react';
import { del, patch, post } from '../../api/client';
import type { Recurring } from '../../api/types';
import { useData, useTeam } from '../../state/data';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { CommitInput, Input, Select, Switch } from '../../ui/Fields';
import { useConfirm } from '../../ui/Modal';
import { TopicPicker } from '../task/TagPickers';
import { SettingsSection } from './SettingsSection';

function RecurringRow({ r }: { r: Recurring }) {
  const { data, mutate } = useData();
  const confirm = useConfirm();
  const edit = (body: Record<string, unknown>) => mutate(() => patch(`/api/recurring/${r.id}`, body));

  return (
    <li className="grid gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <Repeat aria-hidden className="size-4 shrink-0 text-ink-3" />
        <CommitInput className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0" value={r.title} maxLength={200} aria-label="Título da tarefa recorrente" onCommit={(v) => void edit({ title: v })} />
        <Switch className="max-sm:ml-7" checked={Boolean(r.active)} onChange={(v) => void edit({ active: v })} label="Ativa" />
        <span className="flex-1 sm:hidden" />
        <IconButton
          label={`Apagar ${r.title}`}
          size="sm"
          onClick={async () => {
            if (await confirm({ title: 'Apagar tarefa recorrente?', message: `“${r.title}” deixa de voltar todos os meses.`, confirmLabel: 'Apagar', tone: 'danger' })) {
              await mutate(() => del(`/api/recurring/${r.id}`));
            }
          }}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      <div className="grid gap-3 pl-7 sm:grid-cols-[14rem_1fr] sm:items-start">
        <Select aria-label="Projeto" value={r.project_id ?? ''} onChange={(e) => void edit({ project_id: Number(e.target.value) || null })}>
          <option value="">Sem projeto</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <TopicPicker allowCreate={false} value={r.topic_ids} onChange={(ids) => void edit({ topic_ids: ids })} />
      </div>
    </li>
  );
}

function NewRecurring({ memberId, name }: { memberId: number; name: string }) {
  const { mutate } = useData();
  const [title, setTitle] = useState('');

  function add(e: FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle('');
    void mutate(() => post('/api/recurring', { member_id: memberId, title: value }));
  }

  return (
    <form onSubmit={add} className="flex gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Nova tarefa recorrente…" aria-label={`Nova tarefa recorrente de ${name}`} />
      <Button type="submit" icon={<Plus className="size-4" />} disabled={!title.trim()}>Adicionar</Button>
    </form>
  );
}

export function RecurringSection() {
  const { data } = useData();
  const team = useTeam();
  return (
    <SettingsSection
      title="Tarefas mensais recorrentes"
      hint="Voltam como nova tarefa mensal no início de cada mês, com o mesmo projeto e tópicos. Alterar o título aplica-se a partir do próximo mês. Apagar uma tarefa recorrente remove também a cópia deste mês, se ainda estiver por fazer."
    >
      {team.board.map((m) => {
        const list = data.recurring.filter((r) => r.member_id === m.id);
        return (
          <div key={m.id} className="grid gap-3">
            <h3 className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <Avatar name={m.name} color={m.color} size="sm" />
              {m.name}
            </h3>
            {list.length > 0 && <ul className="grid gap-2">{list.map((r) => <RecurringRow key={r.id} r={r} />)}</ul>}
            <NewRecurring memberId={m.id} name={m.name} />
          </div>
        );
      })}
    </SettingsSection>
  );
}
