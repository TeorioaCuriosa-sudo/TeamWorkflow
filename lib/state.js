// O estado que a interface precisa para desenhar o quadro, à medida de quem está a ver.
import { COLORS, TAG_COLORS } from './db.js';
import * as repo from './repo.js';
import { listMembers, publicMe } from './people.js';
import { topics, projects } from './tags.js';
import { pendingFor, unreadCount } from './activity.js';
import { chatUnread } from './chat.js';

export function getState(db, { month, today, currentMonth, extraHolidays, viewer, onlineIds, nowIso, mail }) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE month = ? ORDER BY position, id').all(month);
  const state = {
    today,
    currentMonth,
    month,
    archived: month !== currentMonth,
    me: publicMe(viewer, nowIso),
    members: listMembers(db, { viewer, onlineIds, nowIso }),
    recurring: repo.getRecurring(db),
    tasks: repo.enrichTasks(db, tasks),
    absences: db.prepare('SELECT * FROM absences ORDER BY start_date, end_date, id').all(),
    topics: topics.list(db),
    projects: projects.list(db),
    pending_approvals: pendingFor(db, viewer.id),
    unread: unreadCount(db, viewer.id),
    chat_unread: chatUnread(db, viewer.id),
    extraHolidays,
    palette: COLORS,
    tag_palette: TAG_COLORS,
  };
  if (viewer.role === 'admin') state.mail = { enabled: mail.enabled, from: mail.from, host: mail.host };
  return state;
}
