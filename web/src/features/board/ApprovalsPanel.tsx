import { useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import type { PendingApproval } from '../../api/types';
import { timeAgo } from '../../lib/dates';
import { useData, useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { DecisionDialog } from '../task/DecisionDialog';

/** Pedidos de aprovação que estão à espera da minha resposta. */
export function ApprovalsPanel() {
  const { data } = useData();
  const team = useTeam();
  const { openTask } = useDialogs();
  const [deciding, setDeciding] = useState<{ approval: PendingApproval; decision: 'approved' | 'rejected' } | null>(null);
  const list = data.pending_approvals;
  if (!list.length) return null;

  return (
    <section aria-label="Pedidos de aprovação para ti" className="overflow-hidden rounded-2xl border border-warn/30 bg-warn-soft/50 shadow-card">
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1">
        <span className="grid size-7 place-items-center rounded-lg bg-warn-soft text-warn"><ClipboardCheck className="size-4" aria-hidden /></span>
        <h2 className="text-sm font-semibold text-ink">
          {list.length === 1 ? 'Tens 1 pedido de aprovação' : `Tens ${list.length} pedidos de aprovação`}
        </h2>
      </div>
      <ul className="divide-y divide-warn/15 px-2 pb-2">
        {list.map((a) => {
          const who = team.member(a.requested_by);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2.5">
              {who && <Avatar name={who.name} color={who.color} size="md" />}
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm text-ink">
                  <b className="font-semibold">{a.title}</b>
                  <span className="text-ink-3"> · pedido por {who?.name ?? 'alguém'} {timeAgo(a.created_at)}</span>
                </p>
                {a.request_note && <p className="mt-0.5 text-[13px] text-ink-2">“{a.request_note}”</p>}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => openTask(a.task_id)}>Abrir</Button>
                <Button size="sm" variant="danger" icon={<X className="size-4" />} onClick={() => setDeciding({ approval: a, decision: 'rejected' })}>Rejeitar</Button>
                <Button size="sm" variant="success" icon={<Check className="size-4" />} onClick={() => setDeciding({ approval: a, decision: 'approved' })}>Aprovar</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {deciding && <DecisionDialog approval={deciding.approval} decision={deciding.decision} onClose={() => setDeciding(null)} />}
    </section>
  );
}
