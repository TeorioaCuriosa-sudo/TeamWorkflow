import type { AppState, Member, PresenceStatus } from '../api/types';
import { dayLabel, nextWorkday } from './dates';
import { ABSENCE_TYPES, STATUS_LABEL } from './labels';

export function absenceNow(data: Pick<AppState, 'today' | 'absences'>, memberId: number) {
  return data.absences.find((a) => a.member_id === memberId && a.start_date <= data.today && a.end_date >= data.today);
}

export interface PersonState {
  key: PresenceStatus | 'away';
  label: string;
  text: string;
}

/** O que mostrar sobre alguém neste momento: ausência > estado definido > disponível. */
export function personState(m: Pick<Member, 'id' | 'status' | 'status_text'>, data: Pick<AppState, 'today' | 'absences' | 'extraHolidays'>): PersonState {
  const away = absenceNow(data, m.id);
  if (away) {
    return { key: 'away', label: `${ABSENCE_TYPES[away.type]} · volta a ${dayLabel(nextWorkday(away.end_date, data.extraHolidays))}`, text: '' };
  }
  return { key: m.status, label: STATUS_LABEL[m.status] ?? STATUS_LABEL.available, text: m.status_text || '' };
}

/** Cor do pontinho de cada estado. */
export const STATUS_DOT: Record<PresenceStatus | 'away', string> = {
  available: 'bg-live',
  busy: 'bg-danger',
  meeting: 'bg-warn',
  remote: 'bg-info',
  break: 'bg-ink-3',
  away: 'bg-ink-3',
};
