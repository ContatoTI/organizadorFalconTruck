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

  async declineInvite(inviteId: number): Promise<boolean> {
    const client = createClient();
    await client
      .from('project_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId);
    return true;
  }
}

export const notificationAPI = new NotificationAPI();
