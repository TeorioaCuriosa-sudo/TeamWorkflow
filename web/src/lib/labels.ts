// Textos e pequenas regras que várias partes da interface partilham.

import type { AbsenceType, PresenceStatus, Role, TaskStatus, Urgency } from '../api/types';

export const ABSENCE_TYPES: Record<AbsenceType, string> = { ferias: 'Férias', ausencia: 'Ausência', formacao: 'Formação' };

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  available: 'Disponível', busy: 'Ocupado', meeting: 'Em reunião', remote: 'Remoto', break: 'Em pausa',
};
export const STATUS_KEYS = Object.keys(STATUS_LABEL) as PresenceStatus[];

export const TASK_STATUS: Record<TaskStatus, string> = { todo: 'Por fazer', doing: 'Em progresso', done: 'Concluída' };

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador', comandante: 'Comandante', marketing: 'Marketing', informatica: 'Informática', member: 'Membro',
};
export const ROLE_KEYS = Object.keys(ROLE_LABEL) as Role[];
/** Funções que um comandante pode dar ao adicionar alguém. */
export const ROLES_FOR_COMMANDER: Role[] = ['member', 'marketing', 'informatica'];

export const URGENCY_LABEL: Record<Urgency, string> = { normal: 'Normal', urgent: 'Urgente', priority: 'Prioritário', critical: 'Business critical' };
export const URGENCY_KEYS = Object.keys(URGENCY_LABEL) as Urgency[];

/** O quadro de cada pessoa tem três colunas. Em "Pendentes" caem as tarefas por começar e os pedidos dos colegas. */
export type ColumnKey = TaskStatus;

export const COLUMNS: Array<{ key: ColumnKey; label: string; hint: string }> = [
  { key: 'todo', label: 'Pendentes', hint: 'Por começar, incluindo os pedidos dos colegas' },
  { key: 'doing', label: 'Em progresso', hint: 'A ser feitas agora' },
  { key: 'done', label: 'Finalizadas', hint: 'Concluídas este mês' },
];

export const NAV = [
  { id: 'workflow', label: 'Workflow' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'projetos', label: 'Projetos' },
  { id: 'historico', label: 'Histórico' },
  { id: 'chat', label: 'Chat' },
  { id: 'definicoes', label: 'Definições' },
] as const;
/** As secções do menu. */
export type NavId = (typeof NAV)[number]['id'];
/** Todas as páginas: as do menu e os Modelos (que se abrem pelos botões ao lado de "Equipa"). */
export type ViewId = NavId | 'modelos';
export const isView = (s: string | undefined): s is ViewId => s === 'modelos' || NAV.some((n) => n.id === s);

/** Modelos de tarefas: mensais ou semanais. */
export const TEMPLATE_KIND_LABEL = { monthly: 'Mensais', weekly: 'Semanais' } as const;
