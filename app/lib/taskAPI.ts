/**
 * API abstrata para gerenciar tarefas
 * Centraliza lógica de tarefas que está duplicada em múltiplos arquivos
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Task, TaskViewGroup } from '@/types/index';
import { projectAPI } from '@/app/lib/projectAPI';

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
   * Enriquecer tarefas com IDs dos grupos vinculados via task_view_groups
   */
  private async enrichWithLinkedGroups(tasks: Task[]): Promise<Task[]> {
    if (tasks.length === 0) return tasks;

    const taskIds = tasks.map(t => t.id);
    const client = createClient();
    const { data: links } = await client
      .from('task_view_groups')
      .select('task_id, view_group_id')
      .in('task_id', taskIds);

    const linkMap = new Map<number, number[]>();
    if (links) {
      for (const link of links) {
        const existing = linkMap.get(link.task_id) || [];
        existing.push(link.view_group_id);
        linkMap.set(link.task_id, existing);
      }
    }

    return tasks.map(t => ({
      ...t,
      linked_view_group_ids: linkMap.get(t.id) || [],
    }));
  }

  /**
   * Buscar uma única tarefa pelo ID e enriquecê-la
   */
  async getTask(taskId: number): Promise<Task | null> {
    try {
      const client = createClient();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error || !data) return null;

      const [enrichedTask] = await this.enrichWithCreatorNames([data as Task]);
      const [fullyEnrichedTask] = await this.enrichWithLinkedGroups([enrichedTask]);
      
      return fullyEnrichedTask;
    } catch {
      return null;
    }
  }
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
        if (filters?.groupId) {
          // Inclui tarefas com view_group_id direto OU vinculadas via task_view_groups
          const { data: linked } = await client
            .from('task_view_groups')
            .select('task_id')
            .eq('view_group_id', filters.groupId);
          const linkedIds = (linked || []).map(l => l.task_id);
          if (linkedIds.length > 0) {
            q = q.or(`view_group_id.eq.${filters.groupId},id.in.(${linkedIds.join(',')})`);
          } else {
            q = q.eq('view_group_id', filters.groupId);
          }
        }
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
        if (filters?.groupId) {
          const { data: linked } = await client
            .from('task_view_groups')
            .select('task_id')
            .eq('view_group_id', filters.groupId);
          const linkedIds = (linked || []).map(l => l.task_id);
          if (linkedIds.length > 0) {
            q = q.or(`view_group_id.eq.${filters.groupId},id.in.(${linkedIds.join(',')})`);
          } else {
            q = q.eq('view_group_id', filters.groupId);
          }
        }
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

      // Enriquecer com linked_view_group_ids para exibição em grupos
      const tasksWithLinks = await this.enrichWithLinkedGroups(unique);

      return this.enrichWithCreatorNames(tasksWithLinks);
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
    description?: string | null,
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

      // Monta payload apenas com colunas que existem na tabela
      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        title: title.trim(),
        project_id: projectId || null,
        section_id: sectionId || null,
        view_group_id: groupId || null,
        due_date: dueDate || null,
        position: nextPosition,
        is_completed: false,
      };

      if (description !== undefined && description !== null) insertPayload.description = description;
      if (priority !== undefined && priority !== null) insertPayload.priority = priority;
      if (status !== undefined && status !== null) insertPayload.status = status;

      const { data, error } = await client
        .from('todos')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
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

      if (error) {
        console.error('[taskAPI.updateTask] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
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
        .update({ is_completed: newState, status: newState ? 'concluida' : 'a_fazer' })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true, newState };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Deletar tarefa — apenas o criador ou membros do projeto podem excluir
   */
  async deleteTask(taskId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      const { data: { user } } = await client.auth.getUser();
      if (!user) return { success: false, error: 'Usuário não autenticado' };

      const { data: task, error: fetchError } = await client
        .from('todos')
        .select('user_id, project_id')
        .eq('id', taskId)
        .single();

      if (fetchError || !task) return { success: false, error: 'Tarefa não encontrada' };

      const isCreator = task.user_id === user.id;
      const isProjectTask = task.project_id !== null;
      const isMember = isProjectTask && await projectAPI.isProjectMember(task.project_id!, user.id);

      if (!isCreator && !isMember) {
        return { success: false, error: 'Apenas o criador ou membros do projeto podem excluir esta tarefa' };
      }

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
          section_id: null,
          is_completed: false,
          status: 'a_fazer'
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
    projectId: number | null,
    groupId: number | null = null
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
        let q = client.from('todos').select('id');
        
        if (projectId) {
          q = q.eq('project_id', projectId);
        } else if (groupId) {
          q = q.eq('view_group_id', groupId);
        } else {
          q = q.is('project_id', null).is('view_group_id', null);
        }
        
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

  /**
   * Vincular tarefa a um grupo (bloco de tempo ou lista) sem remover projeto.
   * A tarefa aparece no grupo mas continua vinculada ao projeto de origem.
   */
  async linkTaskToGroup(
    taskId: number,
    groupId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      // Verifica se o vínculo já existe
      const { data: existing } = await client
        .from('task_view_groups')
        .select('id')
        .eq('task_id', taskId)
        .eq('view_group_id', groupId)
        .maybeSingle();

      if (existing) return { success: true }; // já vinculado

      const { error } = await client
        .from('task_view_groups')
        .insert({ task_id: taskId, view_group_id: groupId });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Remover tarefa de um grupo (bloco de tempo ou lista) sem excluí-la do projeto.
   * Desfaz tanto o vínculo direto (view_group_id) quanto o vinculado (task_view_groups).
   */
  async removeTaskFromGroup(
    taskId: number,
    groupId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      // Se a tarefa tem view_group_id direto igual a este grupo, limpa
      const { data: task } = await client
        .from('todos')
        .select('view_group_id')
        .eq('id', taskId)
        .single();

      if (task && task.view_group_id === groupId) {
        const { error: updateError } = await client
          .from('todos')
          .update({ view_group_id: null })
          .eq('id', taskId);
        if (updateError) return { success: false, error: updateError.message };
      }

      // Remove também qualquer vínculo via task_view_groups
      const { error: deleteError } = await client
        .from('task_view_groups')
        .delete()
        .eq('task_id', taskId)
        .eq('view_group_id', groupId);

      if (deleteError) return { success: false, error: deleteError.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Remover vínculo de tarefa com um grupo
   */
  async unlinkTaskFromGroup(
    taskId: number,
    groupId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('task_view_groups')
        .delete()
        .eq('task_id', taskId)
        .eq('view_group_id', groupId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Buscar IDs dos grupos vinculados a uma tarefa
   */
  async getLinkedGroupIds(taskId: number): Promise<number[]> {
    try {
      const client = createClient();
      const { data } = await client
        .from('task_view_groups')
        .select('view_group_id')
        .eq('task_id', taskId);

      return (data || []).map(d => d.view_group_id);
    } catch {
      return [];
    }
  }
}

// Singleton instance
export const taskAPI = new TaskAPI();
