/**
 * API otimizada para notificações
 * Resolve N+1 queries usando join único
 */

import { createClient } from '@/app/lib/supabase/Client';

export interface PendingInvite {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  inviter_name: string;
  inviter_email: string;
  created_at: string;
}

export interface DeclineNotification {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  declined_user_name: string;
  invited_user_id: string;
  created_at: string;
}

export interface TaskReviewNotification {
  id: number;
  task_id: number;
  task_title: string;
  sender_name: string;
  type: string;
  note: string | null;
  created_at: string;
}

class NotificationAPI {
  /**
   * Buscar TODAS as notificações em queries paralelas
   * Resolve N+1 fazendo 3 queries em paralelo ao invés de N queries
   */
  async getUserNotifications(userId: string): Promise<{
    pendingInvites: PendingInvite[];
    declineNotifications: DeclineNotification[];
  }> {
    const client = createClient();

    // 1. Buscar IDs de projetos do usuário primeiro
    const [ownProjectsRes, memberProjectsRes] = await Promise.all([
      client.from('projects').select('id, name, color').eq('owner_id', userId),
      client.from('project_members').select('project_id').eq('user_id', userId),
    ]);

    const userProjectIds = new Set<number>();
    ownProjectsRes.data?.forEach((p: any) => userProjectIds.add(p.id));
    memberProjectsRes.data?.forEach((m: any) => userProjectIds.add(m.project_id));

    // 2. Buscar convites pendentes com JOIN para obter nome/cor do projeto diretamente
    const [pendingInvitesRes, declinedInvitesRes] = await Promise.all([
      client
        .from('project_invites')
        .select('id, project_id, invited_by_user_id, created_at, projects(id, name, color)')
        .eq('invited_user_id', userId)
        .eq('status', 'pending'),
      userProjectIds.size > 0
        ? client
            .from('project_invites')
            .select('id, project_id, invited_user_id, created_at, projects(id, name, color)')
            .in('project_id', Array.from(userProjectIds))
            .eq('status', 'declined')
        : { data: [] },
    ]);

    // 3. Buscar profiles dos invitantes
    const allUserIds = new Set<string>();
    pendingInvitesRes.data?.forEach((i: any) => allUserIds.add(i.invited_by_user_id));
    declinedInvitesRes.data?.forEach((d: any) => allUserIds.add(d.invited_user_id));

    const profilesRes = allUserIds.size > 0
      ? await client.from('profiles').select('id, full_name, email').in('id', Array.from(allUserIds))
      : { data: [] };

    const profilesMap = new Map<string, any>();
    (profilesRes.data || []).forEach((p: any) => profilesMap.set(p.id, p));

    // 4. Formatar convites pendentes (projeto vem do JOIN)
    const pendingInvites: PendingInvite[] = (pendingInvitesRes.data || []).map((inv: any) => ({
      id: inv.id,
      project_id: inv.project_id,
      project_title: inv.projects?.name || 'Projeto',
      project_color: inv.projects?.color || '#6366f1',
      inviter_name: profilesMap.get(inv.invited_by_user_id)?.full_name || 'Usuário',
      inviter_email: profilesMap.get(inv.invited_by_user_id)?.email || '',
      created_at: inv.created_at,
    }));

    // 5. Formatar recusas (projeto vem do JOIN)
    const declineNotifications: DeclineNotification[] = (declinedInvitesRes.data || [])
      .map((dec: any) => ({
        id: dec.id,
        project_id: dec.project_id,
        project_title: dec.projects?.name || 'Projeto',
        project_color: dec.projects?.color || '#6366f1',
        declined_user_name: profilesMap.get(dec.invited_user_id)?.full_name || 'Usuário',
        invited_user_id: dec.invited_user_id,
        created_at: dec.created_at,
      }));

    return { pendingInvites, declineNotifications };
  }

  async getTaskReviewNotifications(userId: string): Promise<TaskReviewNotification[]> {
    const client = createClient();
    const { data } = await client
      .from('task_review_notifications')
      .select('id, task_id, task_title, sender_name, type, note, created_at')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    return (data || []) as TaskReviewNotification[];
  }

  async createTaskReviewNotification(
    userId: string,
    taskId: number,
    taskTitle: string,
    senderName: string,
    type: string = 'review',
    note?: string
  ): Promise<void> {
    const client = createClient();
    const { error } = await client.from('task_review_notifications').insert({
      user_id: userId,
      task_id: taskId,
      task_title: taskTitle,
      sender_name: senderName,
      type,
      note: note || null,
    });
    if (error) {
      console.error('[NotificationAPI] Erro ao criar notificação de tarefa:', error);
    }
  }

  async dismissTaskReviewNotification(id: number): Promise<void> {
    const client = createClient();
    await client.from('task_review_notifications').delete().eq('id', id);
  }

  /**
   * Aprova ou reprova uma tarefa em revisão diretamente pela notificação,
   * sem precisar abrir a tarefa. Atualiza o status e avisa quem enviou.
   */
  async resolveTaskReview(
    notifId: number,
    taskId: number,
    approve: boolean,
    reviewerId: string,
    reviewerName: string,
    note?: string
  ): Promise<{ success: boolean; error?: string }> {
    const client = createClient();
    try {
      const { data: taskRow, error: taskError } = await client
        .from('todos')
        .select('id, user_id, title')
        .eq('id', taskId)
        .single();

      if (taskError || !taskRow) {
        return { success: false, error: 'Tarefa não encontrada' };
      }

      const newStatus = approve ? 'CONCLUIDO' : 'EM_ANDAMENTO';
      const { error: updateError } = await client
        .from('todos')
        .update({ status: newStatus, is_completed: approve })
        .eq('id', taskId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      if (taskRow.user_id && taskRow.user_id !== reviewerId) {
        await client.from('task_review_notifications').insert({
          user_id: taskRow.user_id,
          task_id: taskId,
          task_title: taskRow.title,
          sender_name: reviewerName,
          type: approve ? 'approved' : 'rejected',
          note: approve ? null : (note || 'Há erros a corrigir.'),
        });
      }

      await client.from('task_review_notifications').delete().eq('id', notifId);

      return { success: true };
    } catch (error: any) {
      console.error('[NotificationAPI] Erro ao resolver revisão de tarefa:', error);
      return { success: false, error: error.message };
    }
  }

  async getPendingInvites(userId: string): Promise<PendingInvite[]> {
    const { pendingInvites } = await this.getUserNotifications(userId);
    return pendingInvites;
  }

  async acceptInvite(
    inviteId: number,
    projectId: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const client = createClient();

    try {
      // 1. Validar que o convite existe e pertence a este usuário
      const { data: invite, error: inviteError } = await client
        .from('project_invites')
        .select('id, status')
        .eq('id', inviteId)
        .eq('invited_user_id', userId)
        .single();

      if (inviteError || !invite) {
        return { success: false, error: 'Convite não encontrado ou não pertence a você' };
      }

      if (invite.status !== 'pending') {
        return { success: false, error: 'Convite já foi processado' };
      }

      // 2. Verificar se já é membro (evita duplicação)
      const { data: existingMember } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingMember) {
        // 3. Insere o membro no projeto
        const { error: insertError } = await client
          .from('project_members')
          .insert({ project_id: projectId, user_id: userId });

        if (insertError) {
          console.error('[NotificationAPI] Erro ao inserir membro:', insertError);
          return { success: false, error: insertError.message };
        }
      }

      // 4. Atualizar status do convite para 'accepted'
      const { error: updateError } = await client
        .from('project_invites')
        .update({ status: 'accepted' })
        .eq('id', inviteId);

      if (updateError) {
        console.error('[NotificationAPI] Erro ao atualizar convite:', updateError);
        return { success: false, error: updateError.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('[NotificationAPI] Erro ao aceitar convite:', error);
      return { success: false, error: error.message };
    }
  }

  async declineInvite(inviteId: number, userId: string): Promise<{ success: boolean; error?: string }> {
    const client = createClient();
    const { error } = await client
      .from('project_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId)
      .eq('invited_user_id', userId);

    if (error) {
      console.error('[NotificationAPI] Erro ao recusar convite:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  }
}

export const notificationAPI = new NotificationAPI();
