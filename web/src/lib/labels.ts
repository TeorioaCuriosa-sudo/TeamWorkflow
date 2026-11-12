// Textos e pequenas regras que várias partes da interface partilham.

import type { AbsenceType, PresenceStatus, Task, TaskStatus } from '../api/types';

export const ABSENCE_TYPES: Record<AbsenceType, string> = { ferias: 'Férias', ausencia: 'Ausência', formacao: 'Formação' };

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  available: 'Disponível', busy: 'Ocupado', meeting: 'Em reunião', remote: 'Remoto', break: 'Em pausa',
};
export const STATUS_KEYS = Object.keys(STATUS_LABEL) as PresenceStatus[];

export const TASK_STATUS: Record<TaskStatus, string> = { todo: 'Por fazer', doing: 'Em progresso', done: 'Concluída' };

export type ColumnKey = 'monthly' | 'flex' | 'doing' | 'done';

export const COLUMNS: Array<{ key: ColumnKey; label: string; hint: string; patch: Partial<Pick<Task, 'status' | 'kind'>> }> = [
  { key: 'monthly', label: 'Mensais', hint: 'Acontecem todos os meses', patch: { status: 'todo', kind: 'monthly' } },
  { key: 'flex', label: 'Semanais / diárias', hint: 'Tarefas do dia a dia', patch: { status: 'todo', kind: 'flex' } },
  { key: 'doing', label: 'Em progresso', hint: 'A ser feitas agora', patch: { status: 'doing' } },
  { key: 'done', label: 'Finalizadas', hint: 'Concluídas este mês', patch: { status: 'done' } },
];

export const columnOf = (t: Pick<Task, 'status' | 'kind'>): ColumnKey =>
  t.status === 'doing' ? 'doing' : t.status === 'done' ? 'done' : t.kind === 'monthly' ? 'monthly' : 'flex';

export const NAV = [
  { id: 'workflow', label: 'Workflow' },
  { id: 'ausencias', label: 'Ausências' },
  { id: 'historico', label: 'Histórico' },
  { id: 'chat', label: 'Chat' },
  { id: 'definicoes', label: 'Definições' },
] as const;
export type ViewId = (typeof NAV)[number]['id'];
export const isView = (s: string | undefined): s is ViewId => NAV.some((n) => n.id === s);
