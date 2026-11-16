import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { errorMessage, get, post } from '../api/client';
import type { Notification } from '../api/types';
import { cx } from '../lib/cx';
import { timeAgo } from '../lib/dates';
import { useData, useTeam } from '../state/data';
import { useDialogs } from '../state/dialogs';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { Count } from '../ui/Chip';
import { Popover } from '../ui/Popover';
import { useToast } from '../ui/Toast';

interface NotificationList { items: Notification[]; unread: number }

/** O sino: avisos de aprovações, respostas, atualizações e tarefas atribuídas. */
export function NotificationsBell() {
  const { data, patchState } = useData();
  const team = useTeam();
  const { openTask, openMeeting } = useDialogs();
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const previousUnread = useRef(data.unread);

  const load = useCallback(async () => {
    try {
      const r = await get<NotificationList>('/api/notifications');
      setItems(r.items);
      setLoaded(true);
      patchState((s) => ({ ...s, unread: r.unread }));
      return r;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    }
  }, [patchState, toast]);

  // Chegou um aviso novo: mostra-o num balão e mantém a lista em dia.
  useEffect(() => {
    const before = previousUnread.current;
    previousUnread.current = data.unread;
    if (data.unread <= before) return;
    void (async () => {
      const r = await load();
      const latest = r?.items.find((i) => !i.read_at);
      if (latest) toast.show(latest.text);
    })();
  }, [data.unread, load, toast]);

  async function markRead(body: { all: true } | { ids: number[] }) {
    try {
      await post('/api/notifications/read', body);
      const now = new Date().toISOString();
      setItems((list) => list.map((i) => ('all' in body || body.ids.includes(i.id) ? { ...i, read_at: i.read_at ?? now } : i)));
      const unread = items.filter((i) => !i.read_at && !('all' in body) && !body.ids.includes(i.id)).length;
      patchState((s) => ({ ...s, unread: 'all' in body ? 0 : unread }));
    } catch { /* não é crítico */ }
  }

  const unread = data.unread;

  return (
    <Popover
      label="Notificações"
      onOpenChange={(open) => { if (open) void load(); }}
      panelClassName="w-96 max-sm:fixed max-sm:inset-x-3 max-sm:top-[3.75rem] max-sm:mt-0 max-sm:w-auto"
      trigger={({ open, toggle }) => (
        <span className="relative inline-flex">
          <IconButton
            label={unread ? `Notificações, ${unread} por ler` : 'Notificações'}
            onClick={toggle}
            aria-expanded={open}
            className={cx(open && 'bg-surface-3 text-ink')}
          >
            <Bell className="size-[18px]" />
          </IconButton>
          <Count n={unread} className="pointer-events-none absolute -top-0.5 -right-0.5 ring-2 ring-canvas" />
        </span>
      )}
    >
      {({ close }) => (
        <div>
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-sm font-semibold">Notificações</h2>
            <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" />} disabled={!unread} onClick={() => void markRead({ all: true })}>
              Marcar tudo como lido
            </Button>
          </div>
          {!loaded ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">A carregar…</p>
          ) : items.length ? (
            <ul className="max-h-[26rem] overflow-y-auto overscroll-contain p-1.5">
              {items.map((n) => {
                const who = team.member(n.actor_id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void markRead({ ids: [n.id] });
                        if (n.task_id) openTask(n.task_id);
                        else if (n.meeting_id) openMeeting(n.meeting_id);
                      }}
                      className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-3"
                    >
                      {who ? (
                        <Avatar name={who.name} color={who.color} size="md" />
                      ) : (
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-ink-3">!</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-[13px] leading-snug', n.read_at ? 'text-ink-2' : 'font-medium text-ink')}>{n.text}</span>
                        <span className="mt-0.5 block text-xs text-ink-3">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.read_at && <span aria-label="Por ler" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-[13px] text-ink-3">Sem notificações por agora.</p>
          )}
        </div>
      )}
    </Popover>
  );
}
