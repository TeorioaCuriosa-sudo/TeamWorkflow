import type { Member } from '../../api/types';
import { cx } from '../../lib/cx';
import { unreadFrom } from '../../lib/dm';
import { useData } from '../../state/data';
import { hrefFor } from '../../state/route';
import { Avatar } from '../../ui/Avatar';
import { Count } from '../../ui/Chip';

interface Props {
  member: Pick<Member, 'id' | 'name' | 'color' | 'has_account' | 'removed'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  ringClass?: string;
}

/**
 * A foto de uma pessoa. Clicando, abre a conversa privada com ela (no Chat), e as mensagens por ler
 * aparecem num contador por cima da foto. Na tua própria foto, ou de quem não tem conta, é só a foto.
 */
export function PersonAvatar({ member, size = 'md', online, ringClass = 'ring-surface' }: Props) {
  const { data } = useData();
  const avatar = <Avatar name={member.name} color={member.color} size={size} online={online} ringClass={ringClass} />;
  if (member.id === data.me.id || !member.has_account || member.removed) return avatar;

  const unread = unreadFrom(data.dm, member.id);
  return (
    <a
      href={hrefFor('chat', String(member.id))}
      title={`Enviar mensagem a ${member.name}`}
      aria-label={`Mensagem privada para ${member.name}${unread ? ` (${unread} por ler)` : ''}`}
      className="relative inline-flex shrink-0 rounded-full transition-transform hover:scale-105"
    >
      {avatar}
      <Count n={unread} className={cx('absolute -top-1.5 -right-1.5 ring-2', ringClass)} />
    </a>
  );
}
