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
      let query = client.from('todos').select('*');

      if (filters?.projectId) {
        // Se filtramos por um projeto específico, não precisa checar user_id se confiamos no RLS
        // O RLS já garante que só vemos tarefas de projetos que somos membros
        query = query.eq('project_id', filters.projectId);
      } else {
        // Buscar os projetos que o usuário tem acesso para poder ver todas as tarefas
        const [memberProjects, ownProjects] = await Promise.all([
          client.from('project_members').select('project_id').eq('user_id', userId),
          client.from('projects').select('id').eq('owner_id', userId)
        ]);
        
        const projectIds = new Set<number>();
        memberProjects.data?.forEach(m => projectIds.add(m.project_id));
        ownProjects.data?.forEach(p => projectIds.add(p.id));
        
        if (projectIds.size > 0) {
          query = query.or(`user_id.eq.${userId},project_id.in.(${Array.from(projectIds).join(',')})`);
        } else {
          query = query.eq('user_id', userId);
        }
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
   * @deprecated Apaga tarefas da seção — NÃO usar.
   * Para exclusão de seção, prefira clearTasksFromSection para preservar tarefas na Caixa de Entrada.
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

  /**
   * Mover tarefa para um grupo (view_group_id)
   */
  async moveTaskToGroup(
    taskId: number,
    targetGroupId: number | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ 
          view_group_id: targetGroupId,
          project_id: null,
          section_id: null
        })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Mover tarefa para um projeto
   */
  async moveTaskToProject(
    taskId: number,
    targetProjectId: number | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ 
          project_id: targetProjectId,
          view_group_id: null,
          section_id: null
        })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Limpar associação de tarefas com um projeto (defesa em profundidade).
   * Com ON DELETE SET NULL no banco, isto já ocorre automaticamente,
   * mas mantemos como fallback explícito para evitar apagar tarefas em cascata.
   */
  async clearTasksFromProject(projectId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ project_id: null, section_id: null })
        .eq('project_id', projectId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Limpar associação de tarefas com uma seção (defesa em profundidade).
   */
  async clearTasksFromSection(sectionId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ section_id: null })
        .eq('section_id', sectionId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Limpar associação de tarefas com um bloco/lista (view_group) (defesa em profundidade).
   */
  async clearTasksFromGroup(groupId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ view_group_id: null })
        .eq('view_group_id', groupId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

// Singleton instance
export const taskAPI = new TaskAPI();
