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
}

export const shareAPI = new ShareAPI();
