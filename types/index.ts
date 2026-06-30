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
  view_group_id: number | null;
  project_id: number | null;
  section_id: number | null;
  position: number;
  description: string | null;
  priority: string | null;
  status: string | null;
  created_at: string;
  creator_name?: string;
  linked_view_group_ids?: number[];
  isSyncing?: boolean;
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

export type GroupType = Group['type'];
export type ProjectInviteStatus = ProjectInvite['status'];
export type FinanceType = Finance['type'];
