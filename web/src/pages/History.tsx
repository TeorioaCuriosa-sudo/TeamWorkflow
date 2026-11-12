import { useEffect, useState } from 'react';
import { Download, ExternalLink, History as HistoryIcon } from 'lucide-react';
import { errorMessage, get } from '../api/client';
import type { HistoryMonth } from '../api/types';
import { cap, monthLabel } from '../lib/dates';
import { plural } from '../lib/text';
import { hrefFor } from '../state/route';
import { useData, useTeam } from '../state/data';
import { LinkButton } from '../ui/Button';
import { Badge } from '../ui/Chip';
import { Card, EmptyState, PageHeader, Progress, Spinner } from '../ui/misc';
import { useToast } from '../ui/Toast';

export function HistoryPage() {
  const { data, version } = useData();
  const team = useTeam();
  const toast = useToast();
  const [months, setMonths] = useState<HistoryMonth[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    get<HistoryMonth[]>('/api/history')
      .then((r) => { if (!cancelled) setMonths(r); })
      .catch((e) => toast.error(errorMessage(e)));
    return () => { cancelled = true; };
  }, [version, toast]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Histórico mensal"
        description="O que ficou feito em cada mês, por pessoa."
        actions={team.isAdmin && (
          <LinkButton href="/api/backup" download icon={<Download className="size-4" />}>Cópia de segurança (JSON)</LinkButton>
        )}
      />

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-ink">Como se renova cada mês</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-3">
          No primeiro dia do mês o quadro abre sozinho um mês novo. As tarefas mensais recorrentes voltam como novas, as semanais/diárias por concluir e tudo o que está em progresso passam para o mês novo, e o que ficou concluído fica guardado aqui. As mensais que ninguém concluiu ficam no arquivo do mês a que pertenciam.
        </p>
      </Card>

      {!months ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : months.length === 0 ? (
        <Card><EmptyState icon={<HistoryIcon />} title="Ainda sem histórico">Os meses aparecem aqui à medida que forem acontecendo.</EmptyState></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {months.map((mo) => {
            const pct = mo.total ? Math.round((mo.done / mo.total) * 100) : 0;
            const current = mo.month === data.currentMonth;
            return (
              <Card key={mo.month} className="grid content-start gap-4 p-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-ink">{cap(monthLabel(mo.month))}</h2>
                  {current && <Badge tone="success">A decorrer</Badge>}
                </div>
                <p className="num flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight text-ink">{mo.done}</span>
                  <span className="text-sm text-ink-3">de {mo.total} tarefas concluídas ({pct}%)</span>
                </p>
                <div className="grid gap-2.5">
                  {[...mo.members].sort((a, b) => a.member_id - b.member_id).map((mm) => {
                    const m = team.member(mm.member_id);
                    if (!m) return null;
                    return (
                      <div key={mm.member_id} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-ink">
                          <span aria-hidden style={{ backgroundColor: m.color }} className="size-2.5 shrink-0 rounded-full" />
                          <span className="truncate">{m.name}{m.removed && <span className="text-ink-3"> (removido)</span>}</span>
                        </span>
                        <Progress value={mm.done} max={mm.total} />
                        <span className="num text-[13px] text-ink-3">{mm.done}/{mm.total}</span>
                      </div>
                    );
                  })}
                  {!mo.members.length && <p className="text-[13px] text-ink-3">Ainda sem tarefas.</p>}
                </div>
                {mo.carried > 0 && (
                  <p className="text-[13px] text-ink-3">{plural(mo.carried, 'tarefa transitou', 'tarefas transitaram')} do mês anterior.</p>
                )}
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <LinkButton size="sm" href={hrefFor('workflow', current ? null : mo.month)} icon={<ExternalLink className="size-3.5" />}>Abrir quadro</LinkButton>
                  <LinkButton size="sm" href={`/api/export/${mo.month}.csv`} download icon={<Download className="size-3.5" />}>CSV para Excel</LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
