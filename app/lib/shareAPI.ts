/**
 * API para compartilhamento granular: pasta (section) inteira ou tarefa única.
 * Complementa o projectAPI (que compartilha o projeto inteiro).
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { SectionShare, TaskShare } from '@/types/index';

class ShareAPI {
  /**
   * Compartilhar uma pasta inteira com um usuário
   */
  async shareSection(
    sectionId: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('section_shares')
        .insert({ section_id: sectionId, user_id: userId });

      if (error && error.code !== '23505') return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async unshareSection(
    sectionId: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('section_shares')
        .delete()
        .eq('section_id', sectionId)
        .eq('user_id', userId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getSectionShares(sectionId: number): Promise<SectionShare[]> {
    try {
      const client = createClient();
      const { data } = await client
        .from('section_shares')
        .select('id, section_id, user_id, created_at')
        .eq('section_id', sectionId);

      return (data as SectionShare[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Definir (ou remover) o "dono automático" da pasta: toda tarefa criada
   * nela já nasce direcionada a esse usuário (assignee_id), sem precisar marcar.
   */
  async setSectionDefaultAssignee(
    sectionId: number,
    userId: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('sections')
        .update({ default_assignee_id: userId })
        .eq('id', sectionId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Compartilhar uma única tarefa com um usuário
   */
  async shareTask(
    taskId: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('task_shares')
        .insert({ task_id: taskId, user_id: userId });

      if (error && error.code !== '23505') return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async unshareTask(
    taskId: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('task_shares')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getTaskShares(taskId: number): Promise<TaskShare[]> {
    try {
      const client = createClient();
      const { data } = await client
        .from('task_shares')
        .select('id, task_id, user_id, created_at')
        .eq('task_id', taskId);

      return (data as TaskShare[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Retorna todas as pastas do usuário que têm compartilhamentos ativos,
   * incluindo os dados dos usuários com quem foram compartilhadas.
   */
  async getMySharedSections(userId: string) {
    try {
      const client = createClient();

      const { data: sections } = await client
        .from('sections')
        .select('id, project_id, title, color, order')
        .eq('user_id', userId);

      if (!sections || sections.length === 0) return [];

      const sectionIds = sections.map(s => s.id);

      const { data: shares } = await client
        .from('section_shares')
        .select('section_id, user_id')
        .in('section_id', sectionIds);

      if (!shares || shares.length === 0) return [];

      const sharedSectionIds = [...new Set(shares.map(s => s.section_id))];
      const userIds = [...new Set(shares.map(s => s.user_id))];

      const [{ data: projects }, { data: profiles }] = await Promise.all([
        client.from('projects').select('id, name, color').in('id', sections.map(s => s.project_id)),
        client.from('profiles').select('id, full_name, email').in('id', userIds),
      ]);

      const projectMap = new Map((projects || []).map(p => [p.id, p]));
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      return sharedSectionIds.map(sectionId => {
        const section = sections.find(s => s.id === sectionId)!;
        const sectionShares = shares.filter(s => s.section_id === sectionId);
        return {
          section,
          project: projectMap.get(section.project_id) || null,
          users: sectionShares.map(s => profileMap.get(s.user_id) || null).filter(Boolean),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Retorna todas as pastas compartilhadas COM o usuário,
   * incluindo dados do projeto e do dono.
   */
  async getSectionsSharedWithMe(userId: string) {
    try {
      const client = createClient();

      const { data: shares } = await client
        .from('section_shares')
        .select('section_id, created_at')
        .eq('user_id', userId);

      if (!shares || shares.length === 0) return [];

      const sectionIds = shares.map(s => s.section_id);

      const { data: sections } = await client
        .from('sections')
        .select('id, project_id, title, color, order, user_id')
        .in('id', sectionIds);

      if (!sections || sections.length === 0) return [];

      const projectIds = [...new Set(sections.map(s => s.project_id))];
      const ownerIds = [...new Set(sections.map(s => s.user_id))];

      const [{ data: projects }, { data: profiles }] = await Promise.all([
        client.from('projects').select('id, name, color, owner_id').in('id', projectIds),
        client.from('profiles').select('id, full_name, email').in('id', ownerIds),
      ]);

      const projectMap = new Map((projects || []).map(p => [p.id, p]));
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      return sections.map(section => ({
        section,
        project: projectMap.get(section.project_id) || null,
        owner: profileMap.get(section.user_id) || null,
      }));
    } catch {
      return [];
    }
  }
}

export const shareAPI = new ShareAPI();
