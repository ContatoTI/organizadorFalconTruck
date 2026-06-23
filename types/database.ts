export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Tables {
  todos: {
    Row: {
      id: number
      user_id: string
      title: string
      is_completed: boolean
      goal_id: number | null
      view_group_id: number | null
      project_id: number | null
      section_id: number | null
      due_date: string | null
      position: number
      description: string | null
      priority: string | null
      status: string | null
      created_at: string
    }
    Insert: {
      id?: number
      user_id: string
      title: string
      is_completed?: boolean
      goal_id?: number | null
      view_group_id?: number | null
      project_id?: number | null
      section_id?: number | null
      due_date?: string | null
      position?: number
      description?: string | null
      priority?: string | null
      status?: string | null
      created_at?: string
    }
    Update: {
      id?: number
      user_id?: string
      title?: string
      is_completed?: boolean
      goal_id?: number | null
      view_group_id?: number | null
      project_id?: number | null
      section_id?: number | null
      due_date?: string | null
      position?: number
      description?: string | null
      priority?: string | null
      status?: string | null
      created_at?: string
    }
  }
  view_groups: {
    Row: {
      id: number
      user_id: string
      title: string
      start_time: string | null
      end_time: string | null
      type: string | null
      icon: string | null
      color: string | null
      project_id: number | null
      created_at: string
    }
    Insert: {
      id?: number
      user_id: string
      title: string
      start_time?: string | null
      end_time?: string | null
      type?: string | null
      icon?: string | null
      color?: string | null
      project_id?: number | null
      created_at?: string
    }
    Update: {
      id?: number
      user_id?: string
      title?: string
      start_time?: string | null
      end_time?: string | null
      type?: string | null
      icon?: string | null
      color?: string | null
      project_id?: number | null
      created_at?: string
    }
  }
  finance_transactions: {
    Row: {
      id: number
      user_id: string
      description: string
      amount: number
      date: string
      type: 'income' | 'expense'
      category: string | null
      created_at: string
    }
    Insert: {
      id?: number
      user_id: string
      description: string
      amount: number
      date: string
      type: 'income' | 'expense'
      category?: string | null
      created_at?: string
    }
    Update: {
      id?: number
      user_id?: string
      description?: string
      amount?: number
      date?: string
      type?: 'income' | 'expense'
      category?: string | null
      created_at?: string
    }
  }
  goals: {
    Row: {
      id: number
      user_id: string
      title: string
      description: string | null
      target_date: string | null
      is_completed: boolean
      created_at: string
    }
    Insert: {
      id?: number
      user_id: string
      title: string
      description?: string | null
      target_date?: string | null
      is_completed?: boolean
      created_at?: string
    }
    Update: {
      id?: number
      user_id?: string
      title?: string
      description?: string | null
      target_date?: string | null
      is_completed?: boolean
      created_at?: string
    }
  }
  projects: {
    Row: {
      id: number
      owner_id: string
      name: string
      color: string | null
      created_at: string
    }
    Insert: {
      id?: number
      owner_id: string
      name: string
      color?: string | null
      created_at?: string
    }
    Update: {
      id?: number
      owner_id?: string
      name?: string
      color?: string | null
      created_at?: string
    }
  }
  sections: {
    Row: {
      id: number
      user_id: string
      project_id: number
      title: string
      order: number | null
      created_at: string
    }
    Insert: {
      id?: number
      user_id: string
      project_id: number
      title: string
      order?: number | null
      created_at?: string
    }
    Update: {
      id?: number
      user_id?: string
      project_id?: number
      title?: string
      order?: number | null
      created_at?: string
    }
  }
  profiles: {
    Row: {
      id: string
      email: string | null
      full_name: string | null
      avatar_url: string | null
      created_at: string
    }
    Insert: {
      id: string
      email?: string | null
      full_name?: string | null
      avatar_url?: string | null
      created_at?: string
    }
    Update: {
      id?: string
      email?: string | null
      full_name?: string | null
      avatar_url?: string | null
      created_at?: string
    }
  }
  project_members: {
    Row: {
      id: number
      project_id: number
      user_id: string
      created_at: string
    }
    Insert: {
      id?: number
      project_id: number
      user_id: string
      created_at?: string
    }
    Update: {
      id?: number
      project_id?: number
      user_id?: string
      created_at?: string
    }
  }
  project_invites: {
    Row: {
      id: number
      project_id: number
      invited_user_id: string
      invited_by_user_id: string
      status: 'pending' | 'accepted' | 'declined'
      created_at: string
    }
    Insert: {
      id?: number
      project_id: number
      invited_user_id: string
      invited_by_user_id: string
      status?: 'pending' | 'accepted' | 'declined'
      created_at?: string
    }
    Update: {
      id?: number
      project_id?: number
      invited_user_id?: string
      invited_by_user_id?: string
      status?: 'pending' | 'accepted' | 'declined'
      created_at?: string
    }
  }
  task_view_groups: {
    Row: {
      id: number
      task_id: number
      view_group_id: number
      created_at: string
    }
    Insert: {
      id?: number
      task_id: number
      view_group_id: number
      created_at?: string
    }
    Update: {
      id?: number
      task_id?: number
      view_group_id?: number
      created_at?: string
    }
  }
  events: {
    Row: {
      id: number
      user_id: string
      title: string
      description: string | null
      start_date: string
      end_date: string | null
      created_at: string
    }
    Insert: {
      id?: number
      user_id: string
      title: string
      description?: string | null
      start_date: string
      end_date?: string | null
      created_at?: string
    }
    Update: {
      id?: number
      user_id?: string
      title?: string
      description?: string | null
      start_date?: string
      end_date?: string | null
      created_at?: string
    }
  }
}

export type TableRow<T extends keyof Tables> = Tables[T]['Row'];
export type InsertTables<T extends keyof Tables> = Tables[T]['Insert'];
export type UpdateTables<T extends keyof Tables> = Tables[T]['Update'];

export type Database = {
  public: {
    Tables: Tables;
  }
};
