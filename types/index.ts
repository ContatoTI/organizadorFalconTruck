/**
 * Tipos centralizados da aplicação
 * Consolidação de todas as interfaces para evitar duplicação
 */

// ============= USUARIOS =============
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

// ============= GRUPOS (view_groups) =============
export interface Group {
  id: number;
  user_id: string;
  title: string;
  type: 'time' | 'list';
  icon: string | null;
  color: string | null;
  start_time: string | null;
  end_time: string | null;
  recurrence_type: string | null;
  recurrence_days: number[] | null;
  /** Horario por dia da semana. Quando preenchido, manda em start/end/recurrence. */
  schedules?: BlockSchedule[] | null;
  show_on_dashboard: boolean;
  created_at: string;
}

// ============= TAREFAS =============
export interface Task {
  id: number;
  user_id: string;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  /** Data + hora exata do agendamento (calendario). NULL = sem horario. */
  due_at?: string | null;
  /** Duracao em minutos usada pelo calendario. */
  duration_min?: number | null;
  /** Granularidade do adiamento: a tarefa some ate esse horizonte chegar. */
  plan_horizon?: PlanHorizon | null;
  /** Ancora normalizada do horizonte (dia / segunda da semana / dia 1 / 1o de jan). */
  plan_date?: string | null;
  /** Quando a tarefa foi passada para outra pessoa. */
  delegated_at?: string | null;
  /** Objetivo ao qual a tarefa pertence. */
  goal_id?: number | null;
  /** Tarefa mae, quando esta e um desdobramento de outra. */
  parent_task_id?: number | null;
  /** Repeticao: daily | weekly | monthly | yearly. NULL = compromisso unico. */
  recur_freq?: RecurFreq | null;
  /** A cada quantos periodos (2 + weekly = a cada duas semanas). */
  recur_interval?: number | null;
  /** So para weekly: [2] = toda terca. NULL = usa o dia da ancora. */
  recur_weekdays?: number[] | null;
  /** Ultimo dia da serie (YYYY-MM-DD). NULL = nao acaba. */
  recur_until?: string | null;
  /** Limite de ocorrencias. NULL = sem limite. */
  recur_count?: number | null;
  view_group_id: number | null;
  project_id: number | null;
  section_id: number | null;
  position: number;
  description: string | null;
  priority: string | null;
  status: string | null;
  status_changed_at: string | null;
  auto_review_reason: string | null;
  created_at: string;
  creator_name?: string;
  linked_view_group_ids?: number[];
  isSyncing?: boolean;
  assignee_id?: string | null;
  assignee_name?: string;
  deleted_at?: string | null;
}

// ============= COMPARTILHAMENTO GRANULAR (pasta/tarefa) =============
export interface SectionShare {
  id: number;
  section_id: number;
  user_id: string;
  created_at?: string;
}

export interface TaskShare {
  id: number;
  task_id: number;
  user_id: string;
  created_at?: string;
}

// ============= VINCULO TAREFA-GRUPO (task_view_groups) =============
export interface TaskViewGroup {
  id: number;
  task_id: number;
  view_group_id: number;
  created_at: string;
}

// ============= PROJETOS =============
export interface Project {
  id: number;
  owner_id: string;
  name: string;
  color: string;
  description?: string | null;
  show_on_dashboard: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectMember {
  id: number;
  project_id: number;
  user_id: string;
  role?: string;
  created_at?: string;
}

export interface ProjectInvite {
  id: number;
  project_id: number;
  invited_user_id: string;
  invited_by_user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  project?: Project;
  inviter?: User;
}

export interface ProjectInviteNotification {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  inviter_name: string;
  inviter_email: string;
  created_at?: string;
}

// ============= SECOES DE PROJETO =============
export interface Section {
  id: number;
  project_id: number;
  user_id: string;
  title: string;
  order: number;
  color?: string | null;
  created_at?: string;
  default_assignee_id?: string | null;
}

// ============= FINANCAS =============
export interface Finance {
  id: number;
  user_id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string | null;
  date: string;
  created_at: string;
}

// ============= METAS =============
export interface Goal {
  id: number;
  user_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at?: string;
  /** Objetivo pai. NULL = objetivo de topo. */
  parent_id?: number | null;
  color?: string | null;
  icon?: string | null;
  position?: number;
}

// ============= HABITOS =============
export interface Habit {
  id: number;
  user_id: string;
  title: string;
  color: string | null;
  icon: string | null;
  /** Dias em que vale: [1,3,5] = seg/qua/sex. Vazio ou null = todo dia. */
  weekdays: number[] | null;
  /** Meta de vezes por semana, para habitos sem dia fixo. */
  target_per_week: number | null;
  goal_id: number | null;
  position: number;
  archived_at: string | null;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  user_id: string;
  /** YYYY-MM-DD */
  day: string;
  created_at: string;
}

// ============= REPETICAO =============
export type RecurFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** O que aconteceu numa data especifica de uma serie que se repete. */
export interface TaskOccurrence {
  id: number;
  task_id: number;
  user_id: string;
  /** YYYY-MM-DD da ocorrencia na serie original. */
  occurrence_date: string;
  is_completed: boolean;
  completed_at: string | null;
  is_skipped: boolean;
  moved_to: string | null;
  created_at: string;
}

// ============= PLANEJAMENTO POR HORIZONTE =============
/** Ate onde a tarefa fica fora da vista. */
export type PlanHorizon = 'day' | 'week' | 'month' | 'year';

// ============= HORARIO VARIAVEL POR DIA (blocos de tempo) =============
export interface BlockSchedule {
  /** 0 = domingo .. 6 = sabado */
  day: number;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
}

export type GroupType = Group['type'];
export type ProjectInviteStatus = ProjectInvite['status'];
export type FinanceType = Finance['type'];

// ============= PREFERENCIAS DO USUARIO =============
export interface UserPreferences {
  show_my_tasks_only: boolean;
  show_inbox: boolean;
  show_time_blocks: boolean;
  show_projects: boolean;
  show_lists: boolean;
  /** Modo Agora: so aparecem a Caixa de Entrada e o bloco cuja hora chegou. */
  focus_mode: boolean;
  /** Ultimo destino usado na captura rapida ('inbox' | 'group:12' | 'project:3'). */
  last_capture_target: string;
}
