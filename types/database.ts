export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Tables {
  tasks: {
    Row: {
      id: string
      user_id: string
      title: string
      description: string | null
      completed: boolean
      due_date: string | null
      group_id: string | null
      order: number
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      user_id: string
      title: string
      description?: string | null
      completed?: boolean
      due_date?: string | null
      group_id?: string | null
      order?: number
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      title?: string
      description?: string | null
      completed?: boolean
      due_date?: string | null
      group_id?: string | null
      order?: number
      created_at?: string
      updated_at?: string
    }
  }
  groups: {
    Row: {
      id: string
      user_id: string
      title: string
      icon: string | null
      color: string | null
      type: 'time' | 'list'
      start_time: string | null
      end_time: string | null
      recurrence_type: string | null
      recurrence_days: number[] | null
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      user_id: string
      title: string
      icon?: string | null
      color?: string | null
      type: 'time' | 'list'
      start_time?: string | null
      end_time?: string | null
      recurrence_type?: string | null
      recurrence_days?: number[] | null
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      title?: string
      icon?: string | null
      color?: string | null
      type?: 'time' | 'list'
      start_time?: string | null
      end_time?: string | null
      recurrence_type?: string | null
      recurrence_days?: number[] | null
      created_at?: string
      updated_at?: string
    }
  }
  finances: {
    Row: {
      id: string
      user_id: string
      description: string
      amount: number
      type: 'income' | 'expense'
      category: string | null
      date: string
      created_at: string
    }
    Insert: {
      id?: string
      user_id: string
      description: string
      amount: number
      type: 'income' | 'expense'
      category?: string | null
      date: string
      created_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      description?: string
      amount?: number
      type?: 'income' | 'expense'
      category?: string | null
      date?: string
      created_at?: string
    }
  }
  goals: {
    Row: {
      id: string
      user_id: string
      title: string
      description: string | null
      target_date: string | null
      completed: boolean
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      user_id: string
      title: string
      description?: string | null
      target_date?: string | null
      completed?: boolean
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      user_id?: string
      title?: string
      description?: string | null
      target_date?: string | null
      completed?: boolean
      created_at?: string
      updated_at?: string
    }
  }
  projects: {
    Row: {
      id: string
      owner_id: string
      title: string
      description: string | null
      color: string | null
      icon: string | null
      status: string | null
      created_at: string
    }
    Insert: {
      id?: string
      owner_id: string
      title: string
      description?: string | null
      color?: string | null
      icon?: string | null
      status?: string | null
      created_at?: string
    }
    Update: {
      id?: string
      owner_id?: string
      title?: string
      description?: string | null
      color?: string | null
      icon?: string | null
      status?: string | null
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
