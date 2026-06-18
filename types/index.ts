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
  created_at: string;
}

// ============= TAREFAS =============
export interface Task {
  id: number;
  user_id: string;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  view_group_id: number | null;
  project_id: number | null;
  section_id: number | null;
  created_at: string;
}

// ============= PROJETOS =============
export interface Project {
  id: number;
  owner_id: string;
  title: string;
  color: string;
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
  created_at?: string;
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
}

// ============= TIPOS DE ESTADO DA UI =============
export interface LoadingState {
  groups: boolean;
  projects: boolean;
  tasks: boolean;
  sections: boolean;
  invites: boolean;
}

export interface ErrorState {
  message: string | null;
  field?: string;
}

// ============= CONSTANTES =============
export const COLORS = {
  primary: '#6366f1',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f97316',
  info: '#3b82f6',
  gray: '#6b7280',
} as const;

export const DEFAULT_COLOR = COLORS.primary;

export const TASK_SELECT = 'id, user_id, title, is_completed, due_date, view_group_id, project_id, section_id, created_at';
export const PROJECT_SELECT = 'id, owner_id, title, color, created_at, updated_at';
export const GROUP_SELECT = '*';
export const SECTION_SELECT = 'id, project_id, user_id, title, order, created_at';

export type GroupType = Group['type'];
export type ProjectInviteStatus = ProjectInvite['status'];
export type FinanceType = Finance['type'];
