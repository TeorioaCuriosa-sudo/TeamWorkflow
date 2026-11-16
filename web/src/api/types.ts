// Os "moldes" dos dados que o servidor envia. Se o servidor mudar, o TypeScript avisa
// aqui (e em todos os sítios que usam estes campos) antes de alguma coisa partir.

/** Administrador, ou a função de quem não o é. Marketing e informática têm acesso de membro. */
export type Role = 'admin' | 'comandante' | 'marketing' | 'informatica' | 'member';
export type Urgency = 'normal' | 'urgent' | 'priority' | 'critical';
/** O que a pessoa pode fazer (o servidor volta a verificar tudo). */
export interface Capabilities {
  /** Criar projetos e tópicos (todos). */
  create_tags: boolean;
  /** Alterar e apagar projetos e tópicos (comandantes e administradores). */
  manage_tags: boolean;
  /** Apagar ficheiros de outras pessoas (comandantes e administradores). */
  manage_files: boolean;
  add_people: boolean;
  manage_people: boolean;
  move_others: boolean;
  backup: boolean;
}
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
  can: Capabilities;
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
  urgency: Urgency;
  /** Quem pediu esta tarefa (quando foi criada no cartão de outra pessoa). */
  requested_by: number | null;
  position: number;
  created_at: string;
  started_at: string | null;
  done_at: string | null;
  topic_ids: number[];
  approval: Approval | null;
  comments: number;
  /** Quantos ficheiros estão anexados. */
  file_count: number;
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

/** Uma reunião do calendário. `link` é o endereço da videochamada (Meet, Teams, Zoom…), vazio se não houver. */
export interface Meeting {
  id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  link: string;
  notes: string;
  created_by: number | null;
  created_at: string;
  attendee_ids: number[];
}

/** A quem pertence um ficheiro anexado. */
export type FileOwner = 'project' | 'topic' | 'task' | 'template';
/** Como mostrar um ficheiro: miniatura, leitor, pré-visualização noutro separador, ou só o ícone. */
export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file';

export interface Attachment {
  id: number;
  owner_type: FileOwner;
  owner_id: number;
  name: string;
  mime: string;
  kind: FileKind;
  size: number;
  uploaded_by: number | null;
  created_at: string;
}

/** Modelo de tarefa mensal ou semanal, para aplicar depressa no cartão de uma pessoa. */
export interface TaskTemplate {
  id: number;
  title: string;
  notes: string;
  kind: 'monthly' | 'weekly';
  urgency: Urgency;
  project_id: number | null;
  topic_ids: number[];
  created_by: number | null;
  created_at: string;
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
  meetings: Meeting[];
  /** Ficheiros de projetos, tópicos e modelos (os das tarefas vêm com a tarefa). */
  files: Attachment[];
  templates: TaskTemplate[];
  limits: { max_upload_mb: number };
  topics: Tag[];
  projects: Tag[];
  pending_approvals: PendingApproval[];
  unread: number;
  chat_unread: number;
  /** As minhas conversas privadas, a mais recente primeiro. */
  dm: DirectConversation[];
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
  meta: { from?: unknown; to?: unknown; status?: ApprovalStatus; approval_id?: number; urgency?: Urgency };
  created_at: string;
}

export interface TaskDetail {
  task: Task;
  events: TaskEvent[];
  approvals: Approval[];
  files: Attachment[];
}

export interface Notification {
  id: number;
  actor_id: number | null;
  type: string;
  text: string;
  task_id: number | null;
  meeting_id: number | null;
  created_at: string;
  read_at: string | null;
}

export interface ChatMessage {
  id: number;
  /** Quem escreveu. */
  member_id: number;
  /** Só nas mensagens privadas: para quem foi. */
  to_id?: number;
  text: string;
  created_at: string;
}

/** Uma conversa privada, vista por quem está a ver: a outra pessoa, o que falta ler e a última mensagem (cortada). */
export interface DirectConversation {
  peer_id: number;
  unread: number;
  last: { id: number; member_id: number; text: string; created_at: string };
}

export interface HistoryMonth {
  month: string;
  total: number;
  done: number;
  carried: number;
  /** Tarefas deste mês que ficaram por concluir e passaram ao mês seguinte. */
  carried_out: number;
  members: Array<{ member_id: number; total: number; done: number }>;
}
