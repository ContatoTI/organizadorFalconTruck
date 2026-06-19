/**
 * API abstrata para gerenciar projetos
 * Centraliza lógica duplicada em layout.tsx e page.tsx
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Project, ProjectMember } from '@/types/index';

class ProjectAPI {
  private client = createClient();

  /**
   * Buscar todos os projetos do usuário (próprios + compartilhados)
   * Otimizado para evitar queries N+1
   */
  async getUserProjects(userId: string): Promise<Project[]> {
    const client = createClient();

    try {
      // Buscar projetos próprios
      const { data: ownProjects, error: ownError } = await client
        .from('projects')
        .select('*')
        .eq('owner_id', userId);

      if (ownError) throw ownError;

      // Buscar IDs dos projetos onde é membro
      const { data: memberProjects, error: memberError } = await client
        .from('project_members')
        .select('project_id')
        .eq('user_id', userId);

      if (memberError) throw memberError;

      // Se não tem projetos compartilhados, retornar apenas os próprios
      if (!memberProjects || memberProjects.length === 0) {
        return ownProjects || [];
      }

      // Buscar dados dos projetos compartilhados
      const memberProjectIds = memberProjects
        .map(m => m.project_id)
        .filter((id): id is number => typeof id === 'number');

      const { data: sharedProjects, error: sharedError } = await client
        .from('projects')
        .select('*')
        .in('id', memberProjectIds);

      if (sharedError) throw sharedError;

      // Combinar e remover duplicatas
      const allProjects = [...(ownProjects || []), ...(sharedProjects || [])];
      const uniqueMap = new Map(allProjects.map(p => [p.id, p]));

      return Array.from(uniqueMap.values());
    } catch (error) {
      console.error('Erro ao buscar projetos do usuário:', error);
      return [];
    }
  }

  /**
   * Criar novo projeto
   */
  async createProject(
    userId: string,
    title: string,
    color: string
  ): Promise<{ success: boolean; data?: Project; error?: string }> {
    try {
      if (!title.trim()) {
        return { success: false, error: 'Título não pode estar vazio' };
      }

      const client = createClient();
      const { data, error } = await client
        .from('projects')
        .insert({
          owner_id: userId,
          name: title.trim(),
          color,
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Convidar usuário para projeto
   */
  async inviteUserToProject(
    projectId: number,
    invitedUserId: string,
    inviterUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      // Verificar se já é membro
      const { data: existingMember } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', invitedUserId)
        .maybeSingle();

      if (existingMember) {
        return { success: false, error: 'Usuário já é membro do projeto' };
      }

      // Verificar se já tem convite pendente
      const { data: existingInvite } = await client
        .from('project_invites')
        .select('id')
        .eq('project_id', projectId)
        .eq('invited_user_id', invitedUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingInvite) {
        return { success: false, error: 'Convite pendente já existe para este usuário' };
      }

      // Criar novo convite
      const { error } = await client
        .from('project_invites')
        .insert({
          project_id: projectId,
          invited_user_id: invitedUserId,
          invited_by_user_id: inviterUserId,
          status: 'pending',
        });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Remover membro de projeto
   */
  async removeProjectMember(
    projectId: number,
    userId: string,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      // Verificar se requester é dono
      const { data: project } = await client
        .from('projects')
        .select('owner_id')
        .eq('id', projectId)
        .single();

      if (!project || project.owner_id !== requesterId) {
        return { success: false, error: 'Apenas o dono pode remover membros' };
      }

      // Buscar ID do membro
      const { data: member } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!member) {
        return { success: false, error: 'Membro não encontrado' };
      }

      // Remover membro
      const { error } = await client
        .from('project_members')
        .delete()
        .eq('id', member.id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Buscar membros do projeto
   */
  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    try {
      const client = createClient();
      const { data } = await client
        .from('project_members')
        .select('id, user_id')
        .eq('project_id', projectId);

      return (data || []).map(m => ({
        id: m.id,
        project_id: projectId,
        user_id: m.user_id,
      }));
    } catch (error) {
      console.error('Erro ao buscar membros:', error);
      return [];
    }
  }

  /**
   * Verificar se é dono do projeto
   */
  async isProjectOwner(projectId: number, userId: string): Promise<boolean> {
    try {
      const client = createClient();
      const { data } = await client
        .from('projects')
        .select('owner_id')
        .eq('id', projectId)
        .maybeSingle();

      return data?.owner_id === userId;
    } catch (error) {
      console.error('Erro ao verificar ownership:', error);
      return false;
    }
  }

  /**
   * Verificar se é membro do projeto
   */
  async isProjectMember(projectId: number, userId: string): Promise<boolean> {
    try {
      const client = createClient();

      // Verificar se é dono
      const isOwner = await this.isProjectOwner(projectId, userId);
      if (isOwner) return true;

      // Verificar se é membro
      const { data } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      return !!data;
    } catch (error) {
      console.error('Erro ao verificar membership:', error);
      return false;
    }
  }
}

// Singleton instance
export const projectAPI = new ProjectAPI();
