import { ShieldCheck } from 'lucide-react';
import { ABSENCE_TYPES } from '../../lib/labels';
import { cx } from '../../lib/cx';
import { dayLabel } from '../../lib/dates';
import { personState, STATUS_DOT } from '../../lib/people';
import { useData, useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { Avatar } from '../../ui/Avatar';

/** Quem está disponível, ocupado ou ausente. (A barra lateral mostra o mesmo em ecrãs grandes.) */
export function PresenceStrip({ className }: { className?: string }) {
  const { data } = useData();
  const team = useTeam();
  const { openProfile } = useDialogs();

  return (
    <section aria-label="Quem está disponível" className={cx('grid gap-2 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {team.board.map((m) => {
        const st = personState(m, data);
        const next = data.absences.find((a) => a.member_id === m.id && a.start_date > data.today);
        let line = st.label;
        if (st.text) line += ` · ${st.text}`;
        else if (st.key !== 'away' && next) line += ` · ${ABSENCE_TYPES[next.type].toLowerCase()} de ${dayLabel(next.start_date)}`;
        const mine = m.id === data.me.id;
        const content = (
          <>
            <Avatar name={m.name} color={m.color} size="lg" online={m.online} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <span className="truncate">{m.name}</span>
                {m.role === 'admin' && <ShieldCheck className="size-3.5 shrink-0 text-ink-3" aria-label="Administrador" />}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', STATUS_DOT[st.key])} />
                <span className="truncate">{line}</span>
              </span>
            </span>
          </>
        );
        const cls = 'flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left shadow-card';
        return mine ? (
          <button key={m.id} type="button" title="Mudar o meu estado" onClick={openProfile} className={cx(cls, 'transition-colors hover:border-line-strong')}>
            {content}
          </button>
        ) : (
          <div key={m.id} className={cls}>{content}</div>
        );
      })}
    </section>
  );
}
