import { cx } from '../lib/cx';
import { hrefFor } from '../state/route';
import { personState, STATUS_DOT } from '../lib/people';
import { useData, useTeam } from '../state/data';
import type { ViewId } from '../lib/labels';
import { PersonAvatar } from '../features/people/PersonAvatar';
import { Count } from '../ui/Chip';
import { Wordmark } from '../ui/Logo';
import { navEntries } from './nav';
import { UserMenu } from './UserMenu';

export function Sidebar({ view }: { view: ViewId }) {
  const { data } = useData();
  const team = useTeam();
  const entries = navEntries(data);

  return (
    <aside className="sticky top-0 hidden h-dvh w-68 shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-ink lg:flex">
      <a href={hrefFor('workflow')} className="block px-5 pt-6 pb-5" aria-label="Teoria Workflow — início">
        <Wordmark on="dark" className="h-9" />
        <p className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-sidebar-ink-2 uppercase">
          <span aria-hidden className="h-px w-5 bg-accent" />
          Workflow
        </p>
      </a>

      <nav aria-label="Secções" className="grid gap-0.5 px-3">
        {entries.map((n) => (
          <a
            key={n.id}
            href={hrefFor(n.id)}
            aria-current={view === n.id ? 'page' : undefined}
            className={cx(
              'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [&>svg]:size-[18px]',
              view === n.id ? 'bg-sidebar-active text-white' : 'text-sidebar-ink-2 hover:bg-sidebar-2 hover:text-sidebar-ink',
            )}
          >
            <span className={cx('grid place-items-center [&>svg]:size-[18px]', view === n.id ? 'text-accent' : 'text-sidebar-ink-2 group-hover:text-sidebar-ink')}>{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            <Count n={n.badge} />
          </a>
        ))}
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col px-5">
        <p className="mb-2 text-[11px] font-semibold tracking-wider text-sidebar-ink-2 uppercase">Equipa</p>
        <ul className="scroll-hide -mx-2 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-0.5 overflow-y-auto">
          {team.board.map((m) => {
            const st = personState(m, data);
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <PersonAvatar member={m} size="md" online={m.online} ringClass="ring-sidebar" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-medium">{m.name}{m.id === data.me.id && <span className="font-normal text-sidebar-ink-2"> (tu)</span>}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-sidebar-ink-2">
                    <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', STATUS_DOT[st.key])} />
                    <span className="truncate">{st.text ? `${st.label} · ${st.text}` : st.label}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-sidebar-line p-3">
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  );
}
