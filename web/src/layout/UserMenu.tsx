import { ChevronsUpDown, LogOut, Settings, User } from 'lucide-react';
import { cx } from '../lib/cx';
import { useData } from '../state/data';
import { useDialogs } from '../state/dialogs';
import { hrefFor } from '../state/route';
import { useSession } from '../state/session';
import { Avatar } from '../ui/Avatar';
import { MenuItem, Popover } from '../ui/Popover';

/** O botão com a minha cara e o menu (perfil, definições, sair). */
export function UserMenu({ variant }: { variant: 'sidebar' | 'compact' }) {
  const { data } = useData();
  const { openProfile } = useDialogs();
  const { logout } = useSession();
  const me = data.me;

  return (
    <Popover
      label="Menu da conta"
      up={variant === 'sidebar'}
      align={variant === 'sidebar' ? 'start' : 'end'}
      className={variant === 'sidebar' ? 'block' : undefined}
      panelClassName={variant === 'sidebar' ? 'w-full' : 'w-64'}
      trigger={({ open, toggle }) =>
        variant === 'sidebar' ? (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-2"
          >
            <Avatar name={me.name} color={me.color} size="md" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-sidebar-ink">{me.name}</span>
              <span className="block truncate text-xs text-sidebar-ink-2">{me.role === 'admin' ? 'Administrador' : 'Membro'}</span>
            </span>
            <ChevronsUpDown className="size-4 text-sidebar-ink-2" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Menu da conta"
            className={cx('rounded-full transition-shadow hover:ring-2 hover:ring-line-strong', open && 'ring-2 ring-line-strong')}
          >
            <Avatar name={me.name} color={me.color} size="md" />
          </button>
        )
      }
    >
      {({ close }) => (
        <div role="menu" className="p-1.5">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-ink-3">{me.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<User />} onClick={() => { close(); openProfile(); }}>Perfil, estado e avisos</MenuItem>
          <MenuItem icon={<Settings />} href={hrefFor('definicoes')} onClick={close}>Definições da equipa</MenuItem>
          <div className="my-1 h-px bg-line" />
          <MenuItem icon={<LogOut />} tone="danger" onClick={() => { close(); void logout(); }}>Terminar sessão</MenuItem>
        </div>
      )}
    </Popover>
  );
}
