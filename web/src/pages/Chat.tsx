import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Lock, Users } from 'lucide-react';
import type { ChatMessage, Member } from '../api/types';
import { ConversationView } from '../features/chat/ConversationView';
import { cx } from '../lib/cx';
import { personState, STATUS_DOT } from '../lib/people';
import { unreadFrom } from '../lib/dm';
import { useChat } from '../state/chat';
import { useData, useTeam } from '../state/data';
import { useDm } from '../state/dm';
import { hrefFor, useRoute } from '../state/route';
import { Avatar } from '../ui/Avatar';
import { Count } from '../ui/Chip';
import { Card, PageHeader } from '../ui/misc';

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export function ChatPage() {
  const { data } = useData();
  const team = useTeam();
  const { peerId } = useRoute();
  const peer = peerId === null ? undefined : team.member(peerId);
  const valid = !!peer && !peer.removed && peer.has_account && peer.id !== data.me.id;

  // Uma ligação para alguém que não existe (ou já não está cá) volta ao chat da equipa.
  useEffect(() => {
    if (peerId !== null && !valid) {
      history.replaceState(null, '', '#chat');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, [peerId, valid]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader title="Chat" description="Fala com a equipa toda ou, em privado, com uma pessoa. Podes também clicar na foto de alguém." />
      <Card className="flex h-[calc(100dvh-17rem)] min-h-[24rem] flex-col overflow-hidden lg:grid lg:h-[calc(100dvh-13rem)] lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <ConversationList active={valid ? peer.id : null} />
        {valid ? <PrivateConversation key={peer.id} peer={peer} /> : <TeamConversation />}
      </Card>
    </div>
  );
}

/** A lista de conversas: à esquerda no ecrã grande, uma faixa por cima no telemóvel. */
function ConversationList({ active }: { active: number | null }) {
  const { data } = useData();
  const team = useTeam();
  const list = useRef<HTMLElement>(null);

  const people = useMemo(() => {
    const order = new Map(data.dm.map((c, i) => [c.peer_id, i]));
    return team.people
      .filter((m) => m.id !== data.me.id && m.has_account)
      .sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
  }, [data.dm, data.me.id, team.people]);

  // No telemóvel a faixa desliza: garante que a conversa aberta está à vista.
  useEffect(() => {
    list.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <nav
      ref={list}
      aria-label="Conversas"
      className="scroll-hide flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-surface-2 p-2 lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-2"
    >
      <Entry href={hrefFor('chat')} current={active === null} unread={data.chat_unread}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary lg:size-9"><Users className="size-4" /></span>
        <span className="min-w-0 leading-tight lg:flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">Equipa</span>
          <span className="hidden truncate text-xs text-ink-3 lg:block">Chat de toda a gente</span>
        </span>
      </Entry>
      {people.length > 0 && <p className="hidden px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase lg:block">Mensagens privadas</p>}
      {people.map((m) => {
        const conv = data.dm.find((c) => c.peer_id === m.id);
        const preview = conv ? `${conv.last.member_id === data.me.id ? 'Tu: ' : ''}${conv.last.text}` : 'Sem mensagens';
        return (
          <Entry key={m.id} href={hrefFor('chat', String(m.id))} current={active === m.id} unread={unreadFrom(data.dm, m.id)}>
            <Avatar name={m.name} color={m.color} size="md" online={m.online} ringClass="ring-surface-2" className="lg:[&>span:first-child]:size-9" />
            <span className="min-w-0 leading-tight lg:flex-1">
              <span className="block truncate text-[13px] font-medium text-ink"><span className="lg:hidden">{firstName(m.name)}</span><span className="max-lg:hidden">{m.name}</span></span>
              <span className={cx('hidden truncate text-xs lg:block', conv && conv.unread ? 'font-medium text-ink-2' : 'text-ink-3')}>{preview}</span>
            </span>
          </Entry>
        );
      })}
    </nav>
  );
}

function Entry({ href, current, unread, children }: { href: string; current: boolean; unread: number; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cx(
        'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors lg:w-full lg:gap-3 lg:py-2',
        current ? 'bg-accent-soft ring-1 ring-accent/50' : 'hover:bg-surface-3',
      )}
    >
      {children}
      <Count n={unread} className="shrink-0" />
    </a>
  );
}

function TeamConversation() {
  const chat = useChat();
  const team = useTeam();
  const { ensureLoaded, setViewing, markRead, loaded } = chat;
  useEffect(() => {
    void ensureLoaded();
    setViewing(true);
    return () => setViewing(false);
  }, [ensureLoaded, setViewing]);
  useEffect(() => { if (loaded) markRead(); }, [loaded, markRead]);

  return (
    <ConversationView
      id="team"
      header={
        <Header icon={<span className="grid size-10 place-items-center rounded-full bg-primary text-on-primary"><Users className="size-5" /></span>} title="Chat da equipa">
          Todos os que têm conta veem estas mensagens.
        </Header>
      }
      messages={chat.messages}
      loaded={loaded}
      hasMore={chat.hasMore}
      onLoadOlder={chat.loadOlder}
      onSend={chat.send}
      onRemove={chat.remove}
      canRemove={(m: ChatMessage) => m.member_id === team.me.id || team.isAdmin}
      removeMessage="A mensagem desaparece para todos."
      emptyTitle="Ainda não há mensagens"
      emptyHint="Escreve a primeira!"
      placeholder="Escreve uma mensagem…"
    />
  );
}

function PrivateConversation({ peer }: { peer: Member }) {
  const { data } = useData();
  const team = useTeam();
  const dm = useDm();
  const thread = dm.thread(peer.id);
  const { ensureLoaded, setViewing, markRead } = dm;
  const id = peer.id;
  useEffect(() => {
    void ensureLoaded(id);
    setViewing(id);
    return () => setViewing(null);
  }, [id, ensureLoaded, setViewing]);
  useEffect(() => { if (thread.loaded) markRead(id); }, [id, thread.loaded, markRead]);

  const st = personState(peer, data);
  const first = firstName(peer.name);
  return (
    <ConversationView
      id={`dm:${peer.id}`}
      header={
        <Header
          icon={<Avatar name={peer.name} color={peer.color} size="lg" online={peer.online} ringClass="ring-surface" />}
          title={peer.name}
          note={<span className="inline-flex items-center gap-1"><Lock className="size-3" aria-hidden />Só tu e {first} veem esta conversa.</span>}
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cx('size-1.5 rounded-full', STATUS_DOT[st.key])} />
            {st.text ? `${st.label} · ${st.text}` : st.label}
          </span>
        </Header>
      }
      messages={thread.messages}
      loaded={thread.loaded}
      hasMore={thread.hasMore}
      onLoadOlder={() => dm.loadOlder(id)}
      onSend={(text) => dm.send(id, text)}
      onRemove={(mid) => dm.remove(id, mid)}
      canRemove={(m: ChatMessage) => m.member_id === team.me.id}
      removeMessage={`A mensagem desaparece para ti e para ${first}.`}
      emptyTitle={`Ainda não falaste com ${first}`}
      emptyHint="Escreve a primeira mensagem. Só vocês os dois a veem."
      placeholder={`Escreve a ${first}…`}
    />
  );
}

function Header({ icon, title, note, children }: { icon: ReactNode; title: string; note?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
      {icon}
      <div className="min-w-0 flex-1 leading-tight">
        <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 truncate text-xs text-ink-3">{children}</p>
      </div>
      {note && <p className="hidden shrink-0 text-xs text-ink-3 sm:block">{note}</p>}
    </header>
  );
}

