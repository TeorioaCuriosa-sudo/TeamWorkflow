import { cx } from '../lib/cx';
import type { ViewId } from '../lib/labels';
import { useData } from '../state/data';
import { hrefFor } from '../state/route';
import { Count } from '../ui/Chip';
import { navEntries } from './nav';

/** Barra de navegação no fundo do ecrã, só em telemóvel e tablet. */
export function MobileNav({ view }: { view: ViewId }) {
  const { data } = useData();
  return (
    <nav
      aria-label="Secções"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {navEntries(data).map((n) => (
        <a
          key={n.id}
          href={hrefFor(n.id)}
          aria-current={view === n.id ? 'page' : undefined}
          className={cx('relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium', view === n.id ? 'text-ink' : 'text-ink-3')}
        >
          <span className={cx('relative grid h-7 w-12 place-items-center rounded-full transition-colors [&>svg]:size-5', view === n.id && 'bg-accent-soft text-accent-ink')}>
            {n.icon}
            <Count n={n.badge} className="absolute -top-0.5 right-1 ring-2 ring-surface" />
          </span>
          {n.label}
        </a>
      ))}
    </nav>
  );
}
