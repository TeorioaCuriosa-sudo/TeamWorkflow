import { Monitor, Moon, Sun } from 'lucide-react';
import { cap } from '../lib/dates';
import { cx } from '../lib/cx';
import { useData } from '../state/data';
import { hrefFor } from '../state/route';
import { THEME_LABEL, useTheme } from '../state/theme';
import { IconButton } from '../ui/Button';
import { Wordmark } from '../ui/Logo';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function todayLabel(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${cap(WEEKDAYS[wd])}, ${d} de ${MONTHS[m - 1]}`;
}

export function LiveIndicator() {
  const { online } = useData();
  const label = online === false ? 'A reconectar…' : 'Em direto';
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-3" title={online === false ? 'Sem ligação ao servidor' : 'Ligado ao servidor: as alterações da equipa aparecem logo'}>
      <span
        aria-hidden
        className={cx('size-2 rounded-full', online === false ? 'bg-warn' : online ? 'animate-[pulse-ring_2.4s_ease-out_infinite] bg-live' : 'bg-ink-3')}
      />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}

export function ThemeToggle() {
  const { mode, next } = useTheme();
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  return (
    <IconButton label={`Aspeto: ${THEME_LABEL[mode]} (clica para mudar)`} onClick={next}>
      <Icon className="size-[18px]" />
    </IconButton>
  );
}

export function Topbar() {
  const { data } = useData();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md lg:px-8">
      <a href={hrefFor('workflow')} className="flex items-center gap-2.5 lg:hidden" aria-label="Teoria Workflow — início">
        <Wordmark className="h-5" />
        <span aria-hidden className="h-4 w-px bg-line-strong" />
        <span className="text-sm font-medium text-ink-3">Workflow</span>
      </a>
      <p className="hidden text-sm text-ink-3 lg:block">{todayLabel(data.today)}</p>
      <div className="ml-auto flex items-center gap-1.5">
        <LiveIndicator />
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <ThemeToggle />
        <NotificationsBell />
        <div className="ml-1 lg:hidden"><UserMenu variant="compact" /></div>
      </div>
    </header>
  );
}
