/**
 * API abstrata para gerenciar tarefas
 * Centraliza lógica de tarefas que está duplicada em múltiplos arquivos
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Task } from '@/types/index';

class TaskAPI {
  private client = createClient();

  /**
   * Buscar tarefas do usuário com filtros opcionais
   */
  async getUserTasks(
    userId: string,
    filters?: {
      projectId?: number;
      sectionId?: number;
      groupId?: number;
      onlyToday?: boolean;
      showCompleted?: boolean;
    }
  ): Promise<Task[]> {
    try {
      const client = createClient();
      let query = client
        .from('todos')
        .select('*')
        .eq('user_id', userId);

      if (filters?.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters?.sectionId) {
        query = query.eq('section_id', filters.sectionId);
      }

      if (filters?.groupId) {
        query = query.eq('view_group_id', filters.groupId);
      }

      if (!filters?.showCompleted) {
        query = query.eq('is_completed', false);
      }

      if (filters?.onlyToday) {
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('due_date', today);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Erro ao buscar tarefas:', error);
      return [];
    }
  }

  /**
   * Criar nova tarefa
   */
  async createTask(
    userId: string,
    title: string,
    projectId?: number,
    sectionId?: number,
    groupId?: number,
    dueDate?: string
  ): Promise<{ success: boolean; data?: Task; error?: string }> {
    try {
      if (!title.trim()) {
        return { success: false, error: 'Título não pode estar vazio' };
      }

      const client = createClient();
      const { data, error } = await client
        .from('todos')
        .insert({
          user_id: userId,
          title: title.trim(),
          project_id: projectId || null,
          section_id: sectionId || null,
          view_group_id: groupId || null,
          due_date: dueDate || null,
          is_completed: false,
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as Task };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Atualizar tarefa
   */
  async updateTask(
    taskId: number,
    updates: Partial<Task>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update(updates)
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Toggle status de conclusão
   */
  async toggleTaskCompletion(
    taskId: number,
    currentState: boolean
  ): Promise<{ success: boolean; newState?: boolean; error?: string }> {
    try {
      const client = createClient();
      const newState = !currentState;

      const { error } = await client
        .from('todos')
        .update({ is_completed: newState })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true, newState };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Deletar tarefa
   */
  async deleteTask(taskId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client.from('todos').delete().eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Deletar tarefas de uma seção
   */
  async deleteTasksBySection(sectionId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .delete()
        .eq('section_id', sectionId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Mover tarefas entre seções
   */
  async moveTasksToSection(
    taskIds: number[],
    targetSectionId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ section_id: targetSectionId })
        .in('id', taskIds);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

// Singleton instance
export const taskAPI = new TaskAPI();
