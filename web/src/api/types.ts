// Os "moldes" dos dados que o servidor envia. Se o servidor mudar, o TypeScript avisa
// aqui (e em todos os sítios que usam estes campos) antes de alguma coisa partir.

export type Role = 'admin' | 'member';
export type PresenceStatus = 'available' | 'busy' | 'meeting' | 'remote' | 'break';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskKind = 'monthly' | 'flex';
export type AbsenceType = 'ferias' | 'ausencia' | 'formacao';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** A pessoa que tem a sessão iniciada. */
export interface Me {
  id: number;
  name: string;
  color: string;
  email: string | null;
  role: Role;
  must_change_password: boolean;
  mail_approvals: boolean;
  mail_updates: boolean;
  status: PresenceStatus;
  status_text: string;
  status_until: string | null;
}

/** Qualquer pessoa da equipa (o email só vem para administradores e para a própria pessoa). */
export interface Member {
  id: number;
  name: string;
  color: string;
  active: boolean;
  removed: boolean;
  role: Role;
  status: PresenceStatus;
  status_text: string;
  status_until: string | null;
  online: boolean;
  last_seen: string | null;
  has_account: boolean;
  email?: string | null;
}

/** Tópico ou projeto. */
export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Approval {
  id: number;
  task_id?: number;
  status: ApprovalStatus;
  approver_id: number;
  requested_by: number;
  request_note: string;
  response_note: string;
  created_at: string;
  decided_at: string | null;
}

export interface Task {
  id: number;
  member_id: number;
  title: string;
  notes: string;
  kind: TaskKind;
  status: TaskStatus;
  month: string;
  origin_month: string;
  due: string | null;
  recurring_id: number | null;
  project_id: number | null;
  position: number;
  created_at: string;
  started_at: string | null;
  done_at: string | null;
  topic_ids: number[];
  approval: Approval | null;
  comments: number;
  last_comment: { text: string; member_id: number | null; created_at: string } | null;
}

export interface Recurring {
  id: number;
  member_id: number;
  title: string;
  notes: string;
  active: number | boolean;
  project_id: number | null;
  topic_ids: number[];
}

export interface Absence {
  id: number;
  member_id: number;
  start_date: string;
  end_date: string;
  type: AbsenceType;
  note: string;
}

/** Pedido de aprovação à espera de resposta de quem está a ver. */
export interface PendingApproval {
  id: number;
  task_id: number;
  requested_by: number;
  request_note: string;
  created_at: string;
  title: string;
  month: string;
}

export interface MailInfo {
  enabled: boolean;
  from: string;
  host: string | null;
}

/** Tudo o que a interface precisa para desenhar o quadro (GET /api/state). */
export interface AppState {
  today: string;
  currentMonth: string;
  month: string;
  archived: boolean;
  me: Me;
  members: Member[];
  recurring: Recurring[];
  tasks: Task[];
  absences: Absence[];
  topics: Tag[];
  projects: Tag[];
  pending_approvals: PendingApproval[];
  unread: number;
  chat_unread: number;
  extraHolidays: string[];
  palette: string[];
  tag_palette: string[];
  mail?: MailInfo;
}

export type TaskEventType = 'created' | 'status' | 'assigned' | 'comment' | 'approval';

export interface TaskEvent {
  id: number;
  task_id: number;
  member_id: number | null;
  type: TaskEventType;
  text: string;
  meta: { from?: unknown; to?: unknown; status?: ApprovalStatus; approval_id?: number };
  created_at: string;
}

export interface TaskDetail {
  task: Task;
  events: TaskEvent[];
  approvals: Approval[];
}

export interface Notification {
  id: number;
  actor_id: number | null;
  type: string;
  text: string;
  task_id: number | null;
  created_at: string;
  read_at: string | null;
}

export interface ChatMessage {
  id: number;
  member_id: number;
  text: string;
  created_at: string;
}

export interface HistoryMonth {
  month: string;
  total: number;
  done: number;
  carried: number;
  members: Array<{ member_id: number; total: number; done: number }>;
}
