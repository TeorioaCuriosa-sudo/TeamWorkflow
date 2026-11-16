// Pequenas regras das reuniões que a interface partilha.

import type { Me, Meeting } from '../api/types';
import { pad } from './dates';

/** O nome do serviço de videochamada, se o link for de um dos conhecidos. */
export function providerOf(link: string): string | null {
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`).hostname.toLowerCase();
    if (host === 'meet.google.com') return 'Google Meet';
    if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'Microsoft Teams';
    if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'Zoom';
    if (host === 'meet.jit.si' || host.startsWith('jitsi.')) return 'Jitsi';
  } catch { /* ainda a escrever */ }
  return null;
}

/** Só quem marcou a reunião, ou um administrador, a pode alterar. */
export const canEditMeeting = (me: Pick<Me, 'id' | 'role'>, m: Pick<Meeting, 'created_by'>) => me.role === 'admin' || m.created_by === me.id;

export const timeRange = (m: Pick<Meeting, 'start_time' | 'end_time'>) => `${m.start_time}–${m.end_time}`;

/** "10:30" + 30 min → "11:00" (nunca passa das 23:59). */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** A reunião está a decorrer neste momento (só faz sentido para as de hoje)? */
export function isLive(m: Pick<Meeting, 'date' | 'start_time' | 'end_time'>, today: string, now = new Date()): boolean {
  if (m.date !== today) return false;
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return m.start_time <= t && t < m.end_time;
}

export const byTime = (a: Meeting, b: Meeting) => a.start_time.localeCompare(b.start_time) || a.id - b.id;
