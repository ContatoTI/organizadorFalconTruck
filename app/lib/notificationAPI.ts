/**
 * API otimizada para notificações
 * Resolve N+1 queries usando join único
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Project } from '@/types/index';

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

    // 1. Buscar IDs de projetos do usuário em paralelo
    const [ownProjectsRes, memberProjectsRes, pendingInvitesRes, declinedInvitesRes] = await Promise.all([
      client.from('projects').select('id, title, color').eq('owner_id', userId),
      client.from('project_members').select('project_id').eq('user_id', userId),
      client
        .from('project_invites')
        .select('id, project_id, invited_by_user_id, created_at')
        .eq('invited_user_id', userId)
        .eq('status', 'pending'),
      client
        .from('project_invites')
        .select('id, project_id, invited_user_id, created_at')
        .eq('status', 'declined'),
    ]);

    // Combinar IDs de projetos do usuário
    const userProjectIds = new Set<number>();
    ownProjectsRes.data?.forEach((p: any) => userProjectIds.add(p.id));
    memberProjectsRes.data?.forEach((m: any) => userProjectIds.add(m.project_id));

    // 2. Buscar profiles e projects em paralelo
    const inviterIds = new Set<string>();
    pendingInvitesRes.data?.forEach((i: any) => inviterIds.add(i.invited_by_user_id));

    const declinedUserIds = new Set<string>();
    declinedInvitesRes.data?.forEach((d: any) => declinedUserIds.add(d.invited_user_id));

    const allUserIds = new Set([...inviterIds, ...declinedUserIds]);
    const allProjectIds = new Set<number>();
    pendingInvitesRes.data?.forEach((i: any) => allProjectIds.add(i.project_id));
    declinedInvitesRes.data?.forEach((d: any) => {
      if (userProjectIds.has(d.project_id)) allProjectIds.add(d.project_id);
    });

    const [profilesRes, projectsRes] = await Promise.all([
      allUserIds.size > 0
        ? client.from('profiles').select('id, full_name, email').in('id', Array.from(allUserIds))
        : { data: [] },
      allProjectIds.size > 0
        ? client.from('projects').select('id, title, color').in('id', Array.from(allProjectIds))
        : { data: [] },
    ]);

    // 3. Montar maps para lookup O(1)
    const profilesMap = new Map<string, any>();
    profilesRes.data?.forEach((p: any) => profilesMap.set(p.id, p));

    const projectsMap = new Map<number, any>();
    projectsRes.data?.forEach((p: any) => projectsMap.set(p.id, p));

    // 4. Formatar convites pendentes
    const pendingInvites: PendingInvite[] = (pendingInvitesRes.data || []).map((inv: any) => ({
      id: inv.id,
      project_id: inv.project_id,
      project_title: projectsMap.get(inv.project_id)?.title || 'Projeto',
      project_color: projectsMap.get(inv.project_id)?.color || '#6366f1',
      inviter_name: profilesMap.get(inv.invited_by_user_id)?.full_name || 'Usuário',
      inviter_email: profilesMap.get(inv.invited_by_user_id)?.email || '',
      created_at: inv.created_at,
    }));

    // 5. Formatar recusas (apenas dos projetos do usuário)
    const declineNotifications: DeclineNotification[] = (declinedInvitesRes.data || [])
      .filter((d: any) => userProjectIds.has(d.project_id))
      .map((dec: any) => ({
        id: dec.id,
        project_id: dec.project_id,
        project_title: projectsMap.get(dec.project_id)?.title || 'Projeto',
        project_color: projectsMap.get(dec.project_id)?.color || '#6366f1',
        declined_user_name: profilesMap.get(dec.invited_user_id)?.full_name || 'Usuário',
        invited_user_id: dec.invited_user_id,
        created_at: dec.created_at,
      }));

    return { pendingInvites, declineNotifications };
  }
}

export const notificationAPI = new NotificationAPI();
