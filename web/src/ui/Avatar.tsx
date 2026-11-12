import type { Member, Me } from '../api/types';
import { cx } from '../lib/cx';
import { initials, inkOn } from '../lib/text';

const SIZES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-12 text-base',
} as const;

const DOT_SIZES = { xs: 'size-1.5', sm: 'size-2', md: 'size-2.5', lg: 'size-3', xl: 'size-3.5' } as const;

interface AvatarProps {
  name: string;
  color: string;
  size?: keyof typeof SIZES;
  /** Mostra o ponto de presença (verde = online). */
  online?: boolean;
  /** Cor do fundo por trás do avatar, para o ponto "recortar" bem (barra lateral escura, por exemplo). */
  ringClass?: string;
  className?: string;
}

/** Círculo com as iniciais e a cor da pessoa. */
export function Avatar({ name, color, size = 'md', online, ringClass = 'ring-surface', className }: AvatarProps) {
  return (
    <span className={cx('relative inline-flex shrink-0', className)}>
      <span
        aria-hidden
        className={cx('inline-grid place-items-center rounded-full font-semibold tracking-tight select-none', SIZES[size])}
        style={{ backgroundColor: color, color: inkOn(color) }}
      >
        {initials(name)}
      </span>
      {online !== undefined && (
        <span
          title={online ? 'Online' : 'Offline'}
          className={cx(
            'absolute right-0 bottom-0 rounded-full ring-2',
            DOT_SIZES[size],
            ringClass,
            online ? 'bg-live' : 'bg-ink-3/60',
          )}
        />
      )}
    </span>
  );
}

export function MemberAvatar({ member, ...rest }: { member: Pick<Member | Me, 'name' | 'color'> } & Omit<AvatarProps, 'name' | 'color'>) {
  return <Avatar name={member.name} color={member.color} {...rest} />;
}
