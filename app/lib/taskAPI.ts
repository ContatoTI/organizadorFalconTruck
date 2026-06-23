/**
 * API abstrata para gerenciar tarefas
 * Centraliza lógica de tarefas que está duplicada em múltiplos arquivos
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Task } from '@/types/index';

class TaskAPI {
  /**
   * Buscar perfis dos criadores das tarefas e enriquecer com o nome
   */
  private async enrichWithCreatorNames(tasks: Task[]): Promise<Task[]> {
    const userIds = [...new Set(tasks.map(t => t.user_id))];
    if (userIds.length === 0) return tasks;

    const client = createClient();
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    const nameMap = new Map<string, string>();
    profiles?.forEach(p => nameMap.set(p.id, p.full_name || p.email || 'Usuário'));

    return tasks.map(t => ({
      ...t,
      creator_name: nameMap.get(t.user_id) || undefined,
    }));
  }

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

      if (filters?.projectId) {
        // Filtro por projeto específico — RLS já garante acesso só se for membro
        let q = client.from('todos').select('*').eq('project_id', filters.projectId);
        if (filters?.sectionId) q = q.eq('section_id', filters.sectionId);
        if (!filters?.showCompleted) q = q.eq('is_completed', false);
        if (filters?.onlyToday) q = q.eq('due_date', new Date().toISOString().split('T')[0]);
        const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true });
        if (error) throw error;
        return this.enrichWithCreatorNames((data as Task[]) || []);
      }

      // Buscar tarefas em 2 queries separadas (mais robusto que or() com RLS complexo)
      const [memberProjects, ownProjects] = await Promise.all([
        client.from('project_members').select('project_id').eq('user_id', userId),
        client.from('projects').select('id').eq('owner_id', userId),
      ]);

      const projectIds = new Set<number>();
      memberProjects.data?.forEach(m => projectIds.add(m.project_id));
      ownProjects.data?.forEach(p => projectIds.add(p.id));

      const allTasks: Task[] = [];

      // Query 1: tarefas pessoais do usuário
      {
        let q = client.from('todos').select('*').eq('user_id', userId);
        if (filters?.sectionId) q = q.eq('section_id', filters.sectionId);
        if (filters?.groupId) q = q.eq('view_group_id', filters.groupId);
        if (!filters?.showCompleted) q = q.eq('is_completed', false);
        if (filters?.onlyToday) q = q.eq('due_date', new Date().toISOString().split('T')[0]);
        const { data, error } = await q.order('created_at', { ascending: false });
        if (!error && data) allTasks.push(...(data as Task[]));
      }

      // Query 2: tarefas de projetos que o usuário é membro (criadas por outros)
      if (projectIds.size > 0) {
        let q = client.from('todos').select('*')
          .in('project_id', Array.from(projectIds))
          .neq('user_id', userId); // evita duplicar as pessoais
        if (filters?.sectionId) q = q.eq('section_id', filters.sectionId);
        if (filters?.groupId) q = q.eq('view_group_id', filters.groupId);
        if (!filters?.showCompleted) q = q.eq('is_completed', false);
        if (filters?.onlyToday) q = q.eq('due_date', new Date().toISOString().split('T')[0]);
        const { data, error } = await q.order('created_at', { ascending: false });
        if (!error && data) allTasks.push(...(data as Task[]));
      }

      // Deduplica por id
      const seen = new Set<number>();
      const unique: Task[] = [];
      for (const t of allTasks) {
        if (!seen.has(t.id)) { seen.add(t.id); unique.push(t); }
      }
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return this.enrichWithCreatorNames(unique);
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
    dueDate?: string,
    description?: string,
    priority?: string,
    status?: string
  ): Promise<{ success: boolean; data?: Task; error?: string }> {
    try {
      if (!title.trim()) {
        return { success: false, error: 'Título não pode estar vazio' };
      }

      const client = createClient();

      // Calcula a próxima posição no escopo correto (projeto ou seção)
      let nextPosition = 0;
      if (sectionId) {
        const { data, error: posErr } = await client
          .from('todos')
          .select('position')
          .eq('section_id', sectionId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (posErr) console.error('[taskAPI.createTask] erro query position (section):', JSON.stringify(posErr, null, 2));
        nextPosition = ((data as { position: number } | null)?.position ?? -1) + 1;
      } else if (projectId) {
        const { data, error: posErr } = await client
          .from('todos')
          .select('position')
          .eq('project_id', projectId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (posErr) console.error('[taskAPI.createTask] erro query position (project):', JSON.stringify(posErr, null, 2));
        nextPosition = ((data as { position: number } | null)?.position ?? -1) + 1;
      } else {
        // Tarefas pessoais: agrupa por view_group_id quando houver
        let q = client.from('todos').select('position').eq('user_id', userId);
        if (groupId) q = q.eq('view_group_id', groupId);
        const { data, error: posErr } = await q.order('position', { ascending: false }).limit(1).maybeSingle();
        if (posErr) console.error('[taskAPI.createTask] erro query position (personal):', JSON.stringify(posErr, null, 2));
        nextPosition = ((data as { position: number } | null)?.position ?? -1) + 1;
      }

      const { data, error } = await client
        .from('todos')
        .insert({
          user_id: userId,
          title: title.trim(),
          project_id: projectId || null,
          section_id: sectionId || null,
          view_group_id: groupId || null,
          due_date: dueDate || null,
          position: nextPosition,
          is_completed: false,
          description: description || null,
          priority: priority || null,
          status: status || 'a_fazer',
        })
        .select()
        .single();

      if (error) {
        // Log detalhado para diagnosticar 400 Bad Request do PostgREST
        console.error('[taskAPI.createTask] payload enviado:', {
          user_id: userId,
          title: title.trim(),
          project_id: projectId || null,
          section_id: sectionId || null,
          view_group_id: groupId || null,
          due_date: dueDate || null,
          position: nextPosition,
          is_completed: false,
          description: description || null,
          priority: priority || null,
          status: status || 'a_fazer',
        });
        console.error('[taskAPI.createTask] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
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

  /**
   * Mover tarefa entre seções e reordenar, persistindo positions.
   * Atualiza section_id, insere no targetIndex e normaliza posições
   * nas seções de origem e destino.
   */
  async moveTaskAndReorder(
    taskId: number,
    targetSectionId: number | null,
    targetIndex: number,
    projectId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      const { data: task } = await client
        .from('todos')
        .select('section_id')
        .eq('id', taskId)
        .single();

      if (!task) return { success: false, error: 'Task not found' };

      const sourceSectionId = task.section_id;

      const getSectionTasksQuery = (sid: number | null) => {
        let q = client.from('todos').select('id').eq('project_id', projectId);
        if (sid === null) return q.is('section_id', null);
        return q.eq('section_id', sid);
      };

      // Build ordered list of task IDs in target section (excluding the moved task)
      const { data: targetBefore } = await getSectionTasksQuery(targetSectionId)
        .order('position', { ascending: true })
        .order('id', { ascending: true });

      const targetIds = (targetBefore || [])
        .map(t => t.id)
        .filter(id => id !== taskId);

      // Insert moved task at targetIndex
      targetIds.splice(targetIndex, 0, taskId);

      // Assign sequential positions
      for (let i = 0; i < targetIds.length; i++) {
        const updateData: Record<string, number | null> = { position: i };
        if (targetIds[i] === taskId) {
          updateData.section_id = targetSectionId;
        }
        await client.from('todos').update(updateData).eq('id', targetIds[i]);
      }

      // If source section is different, normalize its positions too
      if (sourceSectionId !== targetSectionId) {
        const { data: sourceTasks } = await getSectionTasksQuery(sourceSectionId)
          .order('position', { ascending: true })
          .order('id', { ascending: true });

        if (sourceTasks) {
          for (let i = 0; i < sourceTasks.length; i++) {
            await client.from('todos').update({ position: i }).eq('id', sourceTasks[i].id);
          }
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

// Singleton instance
export const taskAPI = new TaskAPI();
