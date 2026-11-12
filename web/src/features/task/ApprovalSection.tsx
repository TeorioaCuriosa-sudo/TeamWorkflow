import { useState } from 'react';
import { Check, Clock, ShieldCheck, X } from 'lucide-react';
import { errorMessage, post } from '../../api/client';
import type { ApprovalStatus, Task, TaskDetail } from '../../api/types';
import { timeAgo } from '../../lib/dates';
import { useData, useTeam } from '../../state/data';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { Field, Input, Select } from '../../ui/Fields';
import { FormError } from '../../ui/misc';
import { useToast } from '../../ui/Toast';
import { DecisionDialog } from './DecisionDialog';

const LABEL: Record<ApprovalStatus, string> = { pending: 'À espera', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelado' };
const TONE = { pending: 'warn', approved: 'success', rejected: 'danger', cancelled: 'neutral' } as const;

/** Pedir, dar ou cancelar a aprovação de uma tarefa, e ver o histórico de pedidos. */
export function ApprovalSection({ task, detail, readOnly, reload }: {
  task: Task;
  detail: TaskDetail | null;
  readOnly: boolean;
  /** Volta a pedir os dados da tarefa ao servidor. */
  reload: () => Promise<void>;
}) {
  const { refresh } = useData();
  const team = useTeam();
  const toast = useToast();
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null);
  const [approver, setApprover] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const approvals = detail?.approvals ?? [];
  const pending = approvals.find((a) => a.status === 'pending');
  const history = approvals.filter((a) => a.status !== 'pending');
  const me = team.me;

  const options = team.people.filter((m) => (m.active || m.role === 'admin') && m.id !== me.id);
  const chosen = approver === '' ? options[0]?.id : approver;

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setError('');
    setBusy(true);
    try {
      await post(`/api/tasks/${task.id}/approval`, { approver_id: chosen, note });
      setNote('');
      toast.success('Pedido enviado. A pessoa foi avisada.');
      await reload();
      void refresh();
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    try {
      await post(`/api/approvals/${id}/cancel`, {});
      await reload();
      void refresh();
    } catch (ex) {
      toast.error(errorMessage(ex));
    }
  }

  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck className="size-4 text-ink-3" aria-hidden />
        Aprovação
      </h3>

      {pending ? (
        <div className="grid gap-2.5 rounded-xl border border-warn/30 bg-warn-soft/60 p-3.5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink">
            <Clock className="size-4 text-warn" aria-hidden />
            <b className="font-semibold">À espera de {team.nameOf(pending.approver_id)}</b>
            <span className="text-ink-3">· pedido por {team.nameOf(pending.requested_by)} {timeAgo(pending.created_at)}</span>
          </p>
          {pending.request_note && <p className="text-[13px] text-ink-2">“{pending.request_note}”</p>}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {(pending.requested_by === me.id || team.isAdmin) && <Button size="sm" onClick={() => void cancel(pending.id)}>Cancelar pedido</Button>}
              <span className="flex-1" />
              {(pending.approver_id === me.id || team.isAdmin) && (
                <>
                  <Button size="sm" variant="danger" icon={<X className="size-4" />} onClick={() => setDeciding('rejected')}>Rejeitar</Button>
                  <Button size="sm" variant="success" icon={<Check className="size-4" />} onClick={() => setDeciding('approved')}>Aprovar</Button>
                </>
              )}
            </div>
          )}
        </div>
      ) : !readOnly ? (
        options.length ? (
          <form onSubmit={request} className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Pedir aprovação a" className="min-w-40 flex-1">
                <Select value={chosen ?? ''} onChange={(e) => setApprover(Number(e.target.value))} className="bg-surface">
                  {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === 'admin' ? ' (admin)' : ''}</option>)}
                </Select>
              </Field>
              <Button type="submit" loading={busy}>Pedir aprovação</Button>
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nota para quem vai aprovar (opcional)" aria-label="Nota do pedido" className="bg-surface" />
            <FormError>{error}</FormError>
          </form>
        ) : (
          <p className="text-[13px] text-ink-3">Não há mais ninguém a quem pedir aprovação.</p>
        )
      ) : null}

      {history.length > 0 && (
        <ul className="grid gap-1.5">
          {[...history].reverse().map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
              <Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge>
              <span>{team.nameOf(a.approver_id)}</span>
              {a.response_note && <span className="text-ink-3">— “{a.response_note}”</span>}
              <span className="text-ink-3">· {timeAgo(a.decided_at ?? a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {deciding && pending && (
        <DecisionDialog
          approval={{ id: pending.id, title: task.title }}
          decision={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => void reload()}
        />
      )}
    </section>
  );
}
