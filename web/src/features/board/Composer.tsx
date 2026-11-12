import type { FormEvent } from 'react';
import { useState } from 'react';
import { X } from 'lucide-react';
import { post } from '../../api/client';
import type { ColumnKey } from '../../lib/labels';
import { COLUMNS } from '../../lib/labels';
import { useData } from '../../state/data';
import { Button, IconButton } from '../../ui/Button';
import { Input, Switch } from '../../ui/Fields';

const PLACEHOLDER: Record<ColumnKey, string> = {
  monthly: 'Nova tarefa mensal…',
  flex: 'Nova tarefa…',
  doing: 'O que estás a fazer?…',
  done: 'O que já ficou feito?…',
};

/** Caixa para escrever o título de uma tarefa nova diretamente numa coluna. */
export function Composer({ memberId, column, defaults, onClose }: {
  memberId: number;
  column: ColumnKey;
  /** Projeto/tópico dos filtros ativos: a tarefa nova já entra neles. */
  defaults: { project: number | null; topic: number | null };
  onClose: () => void;
}) {
  const { mutate } = useData();
  const [title, setTitle] = useState('');
  const [repeat, setRepeat] = useState(true);
  const col = COLUMNS.find((c) => c.key === column)!;

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    onClose();
    void mutate(() => post('/api/tasks', {
      member_id: memberId,
      title: text,
      ...col.patch,
      repeat: column === 'monthly' && repeat,
      ...(defaults.project ? { project_id: defaults.project } : {}),
      ...(defaults.topic ? { topic_ids: [defaults.topic] } : {}),
    }));
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
        aria-label="Título da nova tarefa"
        placeholder={PLACEHOLDER[column]}
      />
      {column === 'monthly' && <Switch checked={repeat} onChange={setRepeat} label="Repetir todos os meses" />}
      <div className="flex items-center gap-1.5">
        <Button type="submit" variant="primary" size="sm" disabled={!title.trim()}>Adicionar</Button>
        <IconButton label="Fechar (Esc)" size="sm" onClick={onClose}><X className="size-4" /></IconButton>
      </div>
    </form>
  );
}
