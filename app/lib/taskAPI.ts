/**
 * API abstrata para gerenciar tarefas
 * Centraliza lógica de tarefas que está duplicada em múltiplos arquivos
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Task, TaskViewGroup, PlanHorizon, RecurFreq, TaskOccurrence } from '@/types/index';
import { projectAPI } from '@/app/lib/projectAPI';

/**
 * A coluna todos.duration_min vem da migracao do redesign. Enquanto ela nao
 * for aplicada no banco, o app precisa continuar funcionando — sem duracao,
 * mas sem quebrar a criacao de tarefas. Na primeira recusa do Postgres a
 * gente desliga a coluna e nunca mais tenta nesta sessao.
 */
let durationColumnAvailable = true;

/** O erro do Postgres e "essa coluna nao existe"? (42703 = undefined_column) */
function isMissingColumn(error: { code?: string; message?: string } | null, column: string): boolean {
  if (!error) return false;
  return error.code === '42703'
    || (error.message?.includes(column) === true && error.message.includes('column'));
}

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
  private async enrichWithAssigneeNames(tasks: Task[]): Promise<Task[]> {
    const assigneeIds = [...new Set(tasks.map(t => t.assignee_id).filter(Boolean))] as string[];
    if (assigneeIds.length === 0) return tasks;

    const client = createClient();
    const { data: profiles } = await client
      .from('profiles')
      .select('id, full_name, email')
      .in('id', assigneeIds);

    const nameMap = new Map<string, string>();
    profiles?.forEach(p => nameMap.set(p.id, p.full_name || p.email || 'Usuário'));

    return tasks.map(t => ({
      ...t,
      assignee_name: t.assignee_id ? nameMap.get(t.assignee_id) || undefined : undefined,
    }));
  }

  /**
   * Tarefas com prazo vencido que ainda não foram concluídas nem enviadas para
   * revisão entram automaticamente em revisão, em vez de permanecerem como
   * pendentes/em andamento indefinidamente.
   */
  private async autoMoveOverdueToReview(tasks: Task[]): Promise<Task[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = tasks.filter(t => {
      if (!t.due_date || t.is_completed) return false;
      if (t.status === 'CONCLUIDO' || t.status === 'REVISAO') return false;
      const dueDate = new Date(t.due_date + 'T00:00:00');
      return dueDate < today;
    });

    if (overdue.length === 0) return tasks;

    const client = createClient();
    const ids = overdue.map(t => t.id);
    const { error } = await client.from('todos').update({ status: 'REVISAO' }).in('id', ids);

    if (error) {
      console.error('[taskAPI.autoMoveOverdueToReview] erro Supabase:', JSON.stringify(error, null, 2));
      return tasks;
    }

    const idSet = new Set(ids);
    return tasks.map(t => idSet.has(t.id) ? { ...t, status: 'REVISAO' } : t);
  }

  /**
   * Tarefas que ficaram em A_FAZER / EM_ANDAMENTO por mais de 1 dia (sem mudança
   * de status) são movidas automaticamente para REVISAO com a etiqueta
   * "Tarefa não concluída - Remanejar" para sinalizar que precisam de ação.
   */
  private async autoMoveStaleToReview(tasks: Task[]): Promise<Task[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const stale = tasks.filter(t => {
      if (t.is_completed) return false;
      if (t.status === 'CONCLUIDO' || t.status === 'REVISAO') return false;
      if (!t.status_changed_at) return false;
      return t.status_changed_at < oneDayAgo;
    });

    if (stale.length === 0) return tasks;

    const client = createClient();
    const now = new Date().toISOString();
    const reason = 'Tarefa não concluída - Remanejar';
    const ids = stale.map(t => t.id);
    const { error } = await client
      .from('todos')
      .update({ status: 'REVISAO', status_changed_at: now, auto_review_reason: reason })
      .in('id', ids);

    if (error) {
      console.error('[taskAPI.autoMoveStaleToReview] erro Supabase:', JSON.stringify(error, null, 2));
      return tasks;
    }

    const idSet = new Set(ids);
    return tasks.map(t => idSet.has(t.id)
      ? { ...t, status: 'REVISAO', status_changed_at: now, auto_review_reason: reason }
      : t
    );
  }

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
      const [withAssignee] = await this.enrichWithAssigneeNames([enrichedTask]);
      const [fullyEnrichedTask] = await this.enrichWithLinkedGroups([withAssignee]);
      const [overdueChecked] = await this.autoMoveOverdueToReview([fullyEnrichedTask]);
      const [finalTask] = await this.autoMoveStaleToReview([overdueChecked]);

      return finalTask;
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
        let q = client.from('todos').select('*').eq('project_id', filters.projectId).is('deleted_at', null);
        if (filters?.sectionId) q = q.eq('section_id', filters.sectionId);
        if (!filters?.showCompleted) q = q.eq('is_completed', false);
        if (filters?.onlyToday) q = q.eq('due_date', new Date().toISOString().split('T')[0]);
        const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true });
        if (error) throw error;
        const withCreators = await this.enrichWithCreatorNames((data as Task[]) || []);
        const withAssignees = await this.enrichWithAssigneeNames(withCreators);
        const overdueChecked = await this.autoMoveOverdueToReview(withAssignees);
        return this.autoMoveStaleToReview(overdueChecked);
      }

      // Buscar tarefas em 2 queries separadas (mais robusto que or() com RLS complexo)
      const [memberProjects, ownProjects] = await Promise.all([
        client.from('project_members').select('project_id').eq('user_id', userId),
        client.from('projects').select('id').eq('owner_id', userId),
      ]);

      const memberProjectIds = (memberProjects.data || []).map(m => m.project_id);
      const ownProjectIds = (ownProjects.data || []).map(p => p.id);

      const allTasks: Task[] = [];

      // Query 1: tarefas pessoais do usuário
      {
        let q = client.from('todos').select('*').eq('user_id', userId).is('deleted_at', null);
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

      // Query 2a: tarefas de projetos onde o usuário é dono (todas as tarefas)
      if (ownProjectIds.length > 0) {
        let q = client.from('todos').select('*')
          .in('project_id', ownProjectIds)
          .neq('user_id', userId)
          .is('deleted_at', null);
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

      // Query 2b: tarefas de projetos onde o usuário é membro (apenas as atribuídas a ele)
      if (memberProjectIds.length > 0) {
        let q = client.from('todos').select('*')
          .in('project_id', memberProjectIds)
          .eq('assignee_id', userId)
          .neq('user_id', userId)
          .is('deleted_at', null);
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

      // Query 3: tarefas visíveis via pasta compartilhada ou tarefa compartilhada diretamente
      // (usuário não é dono do projeto nem membro dele)
      {
        const client2 = client;
        const [sectionSharesRes, taskSharesRes] = await Promise.all([
          client2.from('section_shares').select('section_id').eq('user_id', userId),
          client2.from('task_shares').select('task_id').eq('user_id', userId),
        ]);

        const sharedSectionIds = (sectionSharesRes.data || []).map(s => s.section_id);
        const sharedTaskIds = (taskSharesRes.data || []).map(t => t.task_id);

        if (sharedSectionIds.length > 0) {
          let q = client.from('todos').select('*').in('section_id', sharedSectionIds).is('deleted_at', null);
          if (filters?.sectionId) q = q.eq('section_id', filters.sectionId);
          if (!filters?.showCompleted) q = q.eq('is_completed', false);
          if (filters?.onlyToday) q = q.eq('due_date', new Date().toISOString().split('T')[0]);
          const { data, error } = await q.order('created_at', { ascending: false });
          if (!error && data) allTasks.push(...(data as Task[]));
        }

        if (sharedTaskIds.length > 0) {
          const { data, error } = await client.from('todos').select('*').in('id', sharedTaskIds).is('deleted_at', null);
          if (!error && data) allTasks.push(...(data as Task[]));
        }
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

      const withCreators = await this.enrichWithCreatorNames(tasksWithLinks);
      const withAssignees = await this.enrichWithAssigneeNames(withCreators);
      const overdueChecked = await this.autoMoveOverdueToReview(withAssignees);
      return this.autoMoveStaleToReview(overdueChecked);
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
        status_changed_at: new Date().toISOString(),
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
      const finalUpdates: Record<string, unknown> = { ...updates };
      if ('status' in updates && updates.status !== undefined) {
        finalUpdates.status_changed_at = new Date().toISOString();
        if (updates.status !== 'REVISAO') {
          finalUpdates.auto_review_reason = null;
        }
      }
      const { error } = await client
        .from('todos')
        .update(finalUpdates)
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
        .update({
          is_completed: newState,
          status: newState ? 'CONCLUIDO' : 'A_FAZER',
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true, newState };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Excluir tarefa (soft delete) — apenas o criador ou membros do projeto podem excluir.
   * A tarefa não é removida do banco: fica marcada com deleted_at e some das listagens
   * normais, mas continua disponível na Lixeira para restaurar ou excluir definitivamente.
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

      const { error } = await client
        .from('todos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Restaurar tarefa da lixeira
   */
  async restoreTask(taskId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({ deleted_at: null })
        .eq('id', taskId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Excluir tarefa definitivamente (remove a linha do banco) — usado a partir da Lixeira
   */
  async permanentlyDeleteTask(taskId: number): Promise<{ success: boolean; error?: string }> {
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
   * Buscar tarefas na lixeira (soft-deleted). RLS já restringe às tarefas
   * visíveis ao usuário (criador, responsável, dono do projeto ou compartilhadas).
   */
  async getDeletedTasks(): Promise<Task[]> {
    try {
      const client = createClient();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error || !data) return [];

      const withCreators = await this.enrichWithCreatorNames(data as Task[]);
      return this.enrichWithAssigneeNames(withCreators);
    } catch (error) {
      console.error('Erro ao buscar tarefas excluídas:', error);
      return [];
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
          status: 'A_FAZER'
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
    targetProjectId: number | null,
    targetSectionId: number | null = null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('todos')
        .update({
          project_id: targetProjectId,
          view_group_id: null,
          section_id: targetSectionId
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

  // ==========================================================================
  // Redesign: captura rapida e calendario por horario
  // ==========================================================================

  /**
   * Cria uma tarefa a partir de um objeto — sem a fila de 9 parametros
   * posicionais do createTask. E o caminho usado pela captura rapida e pelo
   * calendario, os dois lugares que precisam gravar due_at/duration_min.
   */
  async createTaskFrom(
    userId: string,
    input: {
      title: string;
      projectId?: number | null;
      sectionId?: number | null;
      groupId?: number | null;
      dueDate?: string | null;
      dueAt?: string | null;
      durationMin?: number | null;
      description?: string | null;
      priority?: string | null;
      assigneeId?: string | null;
      goalId?: number | null;
      parentTaskId?: number | null;
      recur?: { freq: RecurFreq; weekdays: number[] } | null;
    }
  ): Promise<{ success: boolean; data?: Task; error?: string }> {
    const title = input.title.trim();
    if (!title) return { success: false, error: 'Titulo nao pode estar vazio' };

    try {
      const client = createClient();

      // Posicao: no topo da lista de destino, para a tarefa recem-capturada
      // aparecer onde o olho ja esta.
      let scope = client.from('todos').select('position').eq('user_id', userId);
      if (input.sectionId) scope = client.from('todos').select('position').eq('section_id', input.sectionId);
      else if (input.projectId) scope = client.from('todos').select('position').eq('project_id', input.projectId);
      else if (input.groupId) scope = scope.eq('view_group_id', input.groupId);
      else scope = scope.is('view_group_id', null).is('project_id', null);

      const { data: posRow } = await scope.order('position', { ascending: false }).limit(1).maybeSingle();
      const nextPosition = ((posRow as { position: number } | null)?.position ?? -1) + 1;

      const payload: Record<string, unknown> = {
        user_id: userId,
        title,
        project_id: input.projectId ?? null,
        section_id: input.sectionId ?? null,
        view_group_id: input.groupId ?? null,
        due_date: input.dueDate ?? null,
        due_at: input.dueAt ?? null,
        duration_min: input.durationMin ?? null,
        position: nextPosition,
        is_completed: false,
        status: 'A_FAZER',
        status_changed_at: new Date().toISOString(),
      };
      if (input.description) payload.description = input.description;
      if (input.priority) payload.priority = input.priority;
      if (input.assigneeId) payload.assignee_id = input.assigneeId;
      if (input.goalId) payload.goal_id = input.goalId;
      if (input.parentTaskId) payload.parent_task_id = input.parentTaskId;
      if (input.recur) {
        payload.recur_freq = input.recur.freq;
        payload.recur_interval = 1;
        payload.recur_weekdays = input.recur.freq === 'weekly' && input.recur.weekdays.length > 0
          ? input.recur.weekdays
          : null;
      }
      if (!durationColumnAvailable) delete payload.duration_min;

      let { data, error } = await client.from('todos').insert(payload).select().single();

      // Banco ainda sem a migracao: refaz o insert sem a coluna nova.
      if (error && isMissingColumn(error, 'duration_min')) {
        durationColumnAvailable = false;
        console.warn('[taskAPI] todos.duration_min ausente — rode a migracao do redesign. Seguindo sem duracao.');
        delete payload.duration_min;
        ({ data, error } = await client.from('todos').insert(payload).select().single());
      }

      // Idem para a migracao de repeticao: melhor criar a tarefa sem repetir
      // do que perder o que a pessoa acabou de digitar.
      if (error && isMissingColumn(error, 'recur_freq')) {
        console.warn('[taskAPI] colunas de repeticao ausentes — rode a migracao. Criando sem repetir.');
        delete payload.recur_freq;
        delete payload.recur_interval;
        delete payload.recur_weekdays;
        ({ data, error } = await client.from('todos').insert(payload).select().single());
      }

      if (error) {
        console.error('[taskAPI.createTaskFrom] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true, data: data as Task };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Agenda (ou reagenda) uma tarefa num horario exato — usado ao arrastar
   * para o calendario e ao redimensionar o bloco.
   * Passar dueAt = null tira a tarefa da agenda e a devolve para a lista.
   */
  async scheduleTask(
    taskId: number,
    dueAt: Date | null,
    durationMin?: number | null
  ): Promise<{ success: boolean; error?: string }> {
    const updates: Record<string, unknown> = {
      due_at: dueAt ? dueAt.toISOString() : null,
      due_date: dueAt ? toLocalISODate(dueAt) : null,
    };
    if (durationMin !== undefined && durationColumnAvailable) updates.duration_min = durationMin;

    try {
      const client = createClient();
      let { error } = await client.from('todos').update(updates).eq('id', taskId);

      if (error && isMissingColumn(error, 'duration_min')) {
        durationColumnAvailable = false;
        delete updates.duration_min;
        ({ error } = await client.from('todos').update(updates).eq('id', taskId));
      }

      if (error) {
        console.error('[taskAPI.scheduleTask] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Adia a tarefa para um horizonte (dia / semana / mes / ano).
   * Passar horizon = null traz a tarefa de volta para a vista de agora.
   *
   * Adiar tambem limpa due_at: "vejo isso mes que vem" e o oposto de ter
   * hora marcada. Se ela tinha horario, ele deixa de fazer sentido.
   */
  async deferTask(
    taskId: number,
    horizon: PlanHorizon | null,
    anchorDate: Date | null
  ): Promise<{ success: boolean; error?: string }> {
    const updates: Record<string, unknown> = horizon && anchorDate
      ? { plan_horizon: horizon, plan_date: toLocalISODate(anchorDate), due_at: null }
      : { plan_horizon: null, plan_date: null };

    try {
      const client = createClient();
      let { error } = await client.from('todos').update(updates).eq('id', taskId);

      // Banco ainda sem a migracao de planejamento: avisa em vez de falhar mudo.
      if (error && (isMissingColumn(error, 'plan_horizon') || isMissingColumn(error, 'plan_date'))) {
        return { success: false, error: 'Rode a migracao de planejamento para poder adiar tarefas.' };
      }
      if (error) {
        console.error('[taskAPI.deferTask] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Passa a tarefa para outra pessoa. Ela sai da sua vista e vai para
   * "Aguardando", com a data para voce saber ha quanto tempo esta esperando.
   * assigneeId = null devolve a tarefa para voce.
   */
  async delegateTask(
    taskId: number,
    assigneeId: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const updates: Record<string, unknown> = assigneeId
      ? { assignee_id: assigneeId, status: 'AGUARDANDO', delegated_at: new Date().toISOString() }
      : { assignee_id: null, status: 'A_FAZER', delegated_at: null };

    try {
      const client = createClient();
      const { error } = await client.from('todos').update(updates).eq('id', taskId);
      if (error) {
        if (isMissingColumn(error, 'delegated_at')) {
          return { success: false, error: 'Rode a migracao de delegacao para poder passar tarefas.' };
        }
        console.error('[taskAPI.delegateTask] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Define (ou tira) a repeticao de um compromisso.
   *
   * A serie e uma linha so: guardamos a REGRA, nao as datas. Quem expande e
   * o calendario, na hora de desenhar o periodo que esta na tela.
   */
  async setRecurrence(
    taskId: number,
    rule: {
      freq: RecurFreq | null;
      interval?: number | null;
      weekdays?: number[] | null;
      until?: string | null;
      count?: number | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const updates: Record<string, unknown> = rule.freq
      ? {
          recur_freq: rule.freq,
          recur_interval: Math.max(1, rule.interval ?? 1),
          recur_weekdays: rule.freq === 'weekly' && rule.weekdays && rule.weekdays.length > 0
            ? rule.weekdays
            : null,
          recur_until: rule.until ?? null,
          recur_count: rule.count ?? null,
        }
      : {
          recur_freq: null,
          recur_interval: 1,
          recur_weekdays: null,
          recur_until: null,
          recur_count: null,
        };

    try {
      const client = createClient();
      const { error } = await client.from('todos').update(updates).eq('id', taskId);
      if (error) {
        if (isMissingColumn(error, 'recur_freq')) {
          return { success: false, error: 'Rode a migracao de repeticao para poder repetir compromissos.' };
        }
        console.error('[taskAPI.setRecurrence] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /** O que ja aconteceu nas datas de series que se repetem, no periodo dado. */
  async getOccurrences(userId: string, fromISO: string, toISO: string): Promise<TaskOccurrence[]> {
    try {
      const client = createClient();
      const { data, error } = await client
        .from('todo_occurrences')
        .select('*')
        .eq('user_id', userId)
        .gte('occurrence_date', fromISO)
        .lte('occurrence_date', toISO);
      if (error) return [];
      return (data as TaskOccurrence[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Marca (ou desmarca) UMA data de uma serie, sem mexer nas outras.
   * Concluir a aula de terca que vem nao pode concluir a serie inteira.
   */
  async setOccurrenceState(
    userId: string,
    taskId: number,
    occurrenceISO: string,
    state: { completed?: boolean; skipped?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const payload: Record<string, unknown> = {
        user_id: userId,
        task_id: taskId,
        occurrence_date: occurrenceISO,
      };
      if (state.completed !== undefined) {
        payload.is_completed = state.completed;
        payload.completed_at = state.completed ? new Date().toISOString() : null;
      }
      if (state.skipped !== undefined) payload.is_skipped = state.skipped;

      const { error } = await client
        .from('todo_occurrences')
        .upsert(payload, { onConflict: 'task_id,occurrence_date' });

      if (error) {
        console.error('[taskAPI.setOccurrenceState] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /** Tarefas que voce delegou e ainda nao voltaram. */
  async getWaitingTasks(userId: string): Promise<Task[]> {
    try {
      const client = createClient();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'AGUARDANDO')
        .is('deleted_at', null)
        .order('delegated_at', { ascending: true });

      if (error) return [];
      return this.enrichWithAssigneeNames((data as Task[]) || []);
    } catch {
      return [];
    }
  }

  /**
   * Marca a tarefa para um dia sem hora ("dia todo" no calendario).
   * Precisa ser uma escrita so: fazer scheduleTask(null) e depois gravar
   * due_date em outra chamada abre uma corrida em que due_date pode acabar
   * nulo dependendo de qual update chega antes no banco.
   */
  async scheduleTaskAllDay(
    taskId: number,
    day: Date
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const updates: Record<string, unknown> = { due_at: null, due_date: toLocalISODate(day) };
      if (durationColumnAvailable) updates.duration_min = null;

      let { error } = await client.from('todos').update(updates).eq('id', taskId);

      if (error && isMissingColumn(error, 'duration_min')) {
        durationColumnAvailable = false;
        delete updates.duration_min;
        ({ error } = await client.from('todos').update(updates).eq('id', taskId));
      }

      if (error) {
        console.error('[taskAPI.scheduleTaskAllDay] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

/** YYYY-MM-DD no fuso local (nao em UTC, senao a tarefa da noite pula de dia). */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Singleton instance
export const taskAPI = new TaskAPI();
