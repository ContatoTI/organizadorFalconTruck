import { createClient } from '@/app/lib/supabase/Client';
import type { Section } from '@/types/index';

class SectionAPI {
  async updateSection(
    sectionId: number,
    updates: Partial<Section>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('sections')
        .update(updates)
        .eq('id', sectionId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async reorderSections(
    sectionId: number,
    targetIndex: number,
    projectId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      const { data: allSections, error: fetchError } = await client
        .from('sections')
        .select('id, order')
        .eq('project_id', projectId)
        .order('order', { ascending: true })
        .order('id', { ascending: true });

      if (fetchError) return { success: false, error: fetchError.message };
      if (!allSections) return { success: false, error: 'No sections found' };

      const ids = allSections.map(s => s.id).filter(id => id !== sectionId);
      ids.splice(targetIndex, 0, sectionId);

      for (let i = 0; i < ids.length; i++) {
        if (allSections.find(s => s.id === ids[i])?.order !== i) {
          await client.from('sections').update({ order: i }).eq('id', ids[i]);
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async moveSectionToProject(
    sectionId: number,
    targetProjectId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();

      const { data: maxOrder } = await client
        .from('sections')
        .select('order')
        .eq('project_id', targetProjectId)
        .order('order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = ((maxOrder as { order: number } | null)?.order ?? -1) + 1;

      const { error } = await client
        .from('sections')
        .update({ project_id: targetProjectId, order: nextOrder })
        .eq('id', sectionId);

      if (error) return { success: false, error: error.message };

      const { data: { user } } = await client.auth.getUser();
      if (user) {
        await client.from('todos')
          .update({ project_id: targetProjectId })
          .eq('section_id', sectionId)
          .neq('project_id', targetProjectId);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

export const sectionAPI = new SectionAPI();
