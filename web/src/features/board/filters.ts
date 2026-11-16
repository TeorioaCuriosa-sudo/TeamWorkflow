// Filtros do quadro (pessoa, projeto, tópico). Ficam guardados neste browser.

import { useCallback, useState } from 'react';
import type { AppState, Task, Urgency } from '../../api/types';

const read = (key: string): number | null => {
  try {
    return Number(localStorage.getItem(`tw.f.${key}`)) || null;
  } catch {
    return null;
  }
};
const write = (key: string, value: number | null) => {
  try {
    if (value === null) localStorage.removeItem(`tw.f.${key}`);
    else localStorage.setItem(`tw.f.${key}`, String(value));
  } catch { /* sem armazenamento local */ }
};

const URGENT_KEYS: Urgency[] = ['urgent', 'priority', 'critical'];
const readUrgency = (): Urgency | null => {
  try {
    const v = localStorage.getItem('tw.f.urgency');
    return URGENT_KEYS.includes(v as Urgency) ? (v as Urgency) : null;
  } catch {
    return null;
  }
};
const writeUrgency = (value: Urgency | null) => {
  try {
    if (value === null) localStorage.removeItem('tw.f.urgency');
    else localStorage.setItem('tw.f.urgency', value);
  } catch { /* sem armazenamento local */ }
};

export interface BoardFilters {
  member: number | null;
  project: number | null;
  topic: number | null;
  urgency: Urgency | null;
  /** Há filtro de projeto, tópico ou urgência ativo (o de pessoa é à parte). */
  tagFilterActive: boolean;
  set: (key: 'member' | 'project' | 'topic', value: number | null) => void;
  setUrgency: (value: Urgency | null) => void;
  clearTags: () => void;
  passes: (t: Task) => boolean;
}

export function useBoardFilters(data: Pick<AppState, 'members' | 'projects' | 'topics'>): BoardFilters {
  const [state, setState] = useState(() => ({ member: read('member'), project: read('project'), topic: read('topic'), urgency: readUrgency() }));

  const set = useCallback((key: 'member' | 'project' | 'topic', value: number | null) => {
    write(key, value);
    setState((s) => ({ ...s, [key]: value }));
  }, []);
  const setUrgency = useCallback((value: Urgency | null) => {
    writeUrgency(value);
    setState((s) => ({ ...s, urgency: value }));
  }, []);
  const clearTags = useCallback(() => {
    write('project', null);
    write('topic', null);
    writeUrgency(null);
    setState((s) => ({ ...s, project: null, topic: null, urgency: null }));
  }, []);

  // Ignora filtros que já não existem (um projeto apagado, uma pessoa removida).
  const project = data.projects.some((p) => p.id === state.project) ? state.project : null;
  const topic = data.topics.some((t) => t.id === state.topic) ? state.topic : null;
  const member = data.members.some((m) => m.id === state.member && m.active && !m.removed) ? state.member : null;

  const urgency = state.urgency;

  return {
    member, project, topic, urgency,
    tagFilterActive: Boolean(project || topic || urgency),
    set, setUrgency, clearTags,
    passes: (t) => (!project || t.project_id === project) && (!topic || t.topic_ids.includes(topic)) && (!urgency || t.urgency === urgency),
  };
}
