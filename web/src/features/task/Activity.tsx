import { useState } from 'react';
import { Bot, MessageSquare, Send } from 'lucide-react';
import { errorMessage, post } from '../../api/client';
import type { Task, TaskDetail, TaskEvent, TaskStatus } from '../../api/types';
import { dateLabel, timeAgo } from '../../lib/dates';
import { TASK_STATUS } from '../../lib/labels';
import { linkify } from '../../lib/text';
import { useTeam } from '../../state/data';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Select, Textarea } from '../../ui/Fields';
import { FormError } from '../../ui/misc';

const VERB: Partial<Record<TaskEvent['type'], string>> = {
  created: 'criou a tarefa',
  status: 'mudou o estado',
  assigned: 'mudou o responsável',
};

function EventRow({ event: e }: { event: TaskEvent }) {
  const team = useTeam();
  const author = team.member(e.member_id);
  let body: React.ReactNode = null;
  if (e.type === 'comment') {
    body = <p className="mt-1 rounded-lg rounded-tl-sm bg-surface-3 px-3 py-2 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-ink">{linkify(e.text)}</p>;
  } else if (e.type === 'status') {
    body = <p className="mt-0.5 text-[13px] text-ink-2">→ {e.meta.urgency ? e.text.replace(/^Urgência: /, '') : e.text}</p>;
  } else if (e.type === 'assigned' || e.type === 'approval') {
    body = <p className="mt-0.5 text-[13px] text-ink-2">{e.text}</p>;
  } else if (e.type === 'created' && !author && e.text) {
    body = <p className="mt-0.5 text-[13px] text-ink-3">{e.text}</p>;
  }

  return (
    <li className="flex gap-3">
      {author ? (
        <Avatar name={author.name} color={author.color} size="sm" className="mt-0.5" />
      ) : (
        <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-ink-3"><Bot className="size-3.5" /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-tight">
          <b className="font-semibold text-ink">{author?.name ?? 'Sistema'}</b>
          {VERB[e.type] && <span className="text-ink-3"> {e.type === 'status' && e.meta.urgency ? 'mudou a urgência' : VERB[e.type]}</span>}
          <span className="text-ink-3" title={dateLabel(e.created_at)}> · {timeAgo(e.created_at)}</span>
        </p>
        {body}
      </div>
    </li>
  );
}

/** O fio de atualizações de uma tarefa, com o formulário para escrever uma nova. */
export function ActivitySection({ task, detail, readOnly, canSetStatus, onPublished }: {
  task: Task;
  detail: TaskDetail | null;
  readOnly: boolean;
  /** Só quem tem a tarefa (ou um administrador) muda o estado; os outros só escrevem. */
  canSetStatus: boolean;
  onPublished: (next: TaskDetail) => void;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSeen, setLastSeen] = useState(task.status);
  // Se o estado da tarefa mudou (por mim ou por outra pessoa), o seletor acompanha.
  if (lastSeen !== task.status) { setLastSeen(task.status); setStatus(task.status); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const next = await post<TaskDetail>(`/api/tasks/${task.id}/events`, { text, ...(canSetStatus ? { status } : {}) });
      setText('');
      onPublished(next);
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  const events = detail?.events ?? [];

  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <MessageSquare className="size-4 text-ink-3" aria-hidden />
        Atualizações
      </h3>
      {!readOnly && (
        <form onSubmit={submit} className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <Textarea
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreve uma atualização… (ex.: já enviei o contrato, falta a assinatura)"
            aria-label="Nova atualização"
            className="bg-surface"
          />
          <div className="flex flex-wrap items-center gap-2">
            {canSetStatus && (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                Estado
                <div className="w-40">
                  <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className="h-8 text-[13px]">
                    {(Object.keys(TASK_STATUS) as TaskStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS[k]}</option>)}
                  </Select>
                </div>
              </label>
            )}
            <span className="flex-1" />
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!text.trim() && (!canSetStatus || status === task.status)} icon={<Send className="size-3.5" />}>Publicar</Button>
          </div>
          <FormError>{error}</FormError>
        </form>
      )}
      {events.length ? (
        <ol className="grid gap-3.5">
          {[...events].reverse().map((e) => <EventRow key={e.id} event={e} />)}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-3">{detail ? 'Ainda sem atualizações.' : 'A carregar atualizações…'}</p>
      )}
    </section>
  );
}
