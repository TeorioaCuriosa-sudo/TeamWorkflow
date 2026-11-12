import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import type { ChatMessage } from '../api/types';
import { cx } from '../lib/cx';
import { dayHeading, timeLabel } from '../lib/dates';
import { linkify } from '../lib/text';
import { useChat } from '../state/chat';
import { useTeam } from '../state/data';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { useConfirm } from '../ui/Modal';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/misc';

const MAX_LEN = 2000;
const GROUP_MS = 5 * 60_000;
let draftMemory = ''; // o rascunho sobrevive a mudar de página

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function ChatPage() {
  const chat = useChat();
  const team = useTeam();
  const confirm = useConfirm();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [draft, setDraft] = useState(draftMemory);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const { ensureLoaded, setViewing, markRead, loaded, messages } = chat;
  useEffect(() => {
    void ensureLoaded();
    setViewing(true);
    return () => setViewing(false);
  }, [ensureLoaded, setViewing]);
  useEffect(() => { if (loaded) markRead(); }, [loaded, markRead]);

  // Mensagem nova: vai ao fim se já estávamos no fim (ou fomos nós a escrever).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, loaded]);

  function onScroll() {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function older() {
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    stick.current = false;
    await chat.loadOlder();
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  }

  function resize() {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }
  useEffect(resize, [draft]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    stick.current = true;
    const ok = await chat.send(text);
    if (ok) { setDraft(''); draftMemory = ''; }
    setSending(false);
    input.current?.focus();
  }

  async function remove(m: ChatMessage) {
    if (await confirm({ title: 'Apagar mensagem?', message: 'A mensagem desaparece para todos.', confirmLabel: 'Apagar', tone: 'danger' })) await chat.remove(m.id);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader title="Chat da equipa" description="Todos os que têm conta veem estas mensagens." />
      <Card className="flex h-[calc(100dvh-17rem)] min-h-[22rem] flex-col overflow-hidden lg:h-[calc(100dvh-13rem)]">
        <div ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="Mensagens" className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {!loaded ? (
            <div className="grid h-full place-items-center"><Spinner /></div>
          ) : (
            <>
              {chat.hasMore && (
                <div className="mb-4 flex justify-center">
                  <Button size="sm" onClick={() => void older()}>Mensagens anteriores</Button>
                </div>
              )}
              {!messages.length && <EmptyState icon={<MessageSquare />} title="Ainda não há mensagens">Escreve a primeira!</EmptyState>}
              <div className="grid gap-0.5">
                {messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  const newDay = !prev || dayKey(prev.created_at) !== dayKey(msg.created_at);
                  const grouped = !newDay && prev.member_id === msg.member_id && new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS;
                  const author = team.member(msg.member_id);
                  const mine = msg.member_id === team.me.id;
                  return (
                    <div key={msg.id} className="grid gap-0.5">
                      {newDay && (
                        <div className="my-3 flex items-center gap-3 text-xs font-medium text-ink-3">
                          <span className="h-px flex-1 bg-line" />
                          {dayHeading(msg.created_at)}
                          <span className="h-px flex-1 bg-line" />
                        </div>
                      )}
                      <div className={cx('group flex items-end gap-2.5', mine && 'flex-row-reverse', grouped ? 'mt-0' : 'mt-2.5')}>
                        <div className="w-8 shrink-0">
                          {!grouped && author && <Avatar name={author.name} color={author.color} size="md" />}
                        </div>
                        <div className={cx('flex max-w-[min(34rem,80%)] flex-col', mine ? 'items-end' : 'items-start')}>
                          {!grouped && (
                            <p className="mb-1 px-1 text-xs text-ink-3">
                              <b className="font-semibold text-ink-2">{author?.name ?? 'Alguém'}</b>
                              {author?.removed && ' (removido)'}
                              <time dateTime={msg.created_at}> · {timeLabel(msg.created_at)}</time>
                            </p>
                          )}
                          <p
                            title={timeLabel(msg.created_at)}
                            className={cx(
                              'rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap',
                              mine ? 'bg-primary text-on-primary' : 'bg-surface-3 text-ink',
                              mine ? (grouped ? '' : 'rounded-br-md') : (grouped ? '' : 'rounded-bl-md'),
                            )}
                          >
                            {linkify(msg.text)}
                          </p>
                        </div>
                        {(mine || team.isAdmin) && (
                          <IconButton label="Apagar mensagem" size="sm" onClick={() => void remove(msg)} className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                            <Trash2 className="size-4" />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          className="flex items-end gap-2 border-t border-line bg-surface-2 p-3"
        >
          <textarea
            ref={input}
            rows={1}
            maxLength={MAX_LEN}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); draftMemory = e.target.value; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
            placeholder="Escreve uma mensagem…"
            aria-label="Mensagem"
            className="max-h-36 min-h-10 flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink focus:border-ring focus:ring-3 focus:ring-ring/20 focus:outline-none"
          />
          <Button type="submit" variant="primary" className="h-10" loading={sending} disabled={!draft.trim()} icon={<Send className="size-4" />}>
            <span className="max-sm:sr-only">Enviar</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
