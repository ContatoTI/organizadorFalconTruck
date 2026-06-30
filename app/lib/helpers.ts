/**
 * Funções auxiliares compartilhadas
 * Evita duplicação de lógica em múltiplos arquivos
 */

import { createClient } from '@/app/lib/supabase/Client';
import type {
  Project,
  Section,
} from '@/types/index';

/**
 * Validar se é um UUID válido
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validar permissão de acesso a projeto
 */
export async function validateProjectAccess(
  projectId: number,
  userId: string
): Promise<{ hasAccess: boolean; isOwner: boolean }> {
  const client = createClient();

  const { data: project } = await client
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (!project) return { hasAccess: false, isOwner: false };

  const isOwner = project.owner_id === userId;
  if (isOwner) return { hasAccess: true, isOwner: true };

  // Verificar se é membro
  const { data: member } = await client
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  return { hasAccess: !!member, isOwner: false };
}

/**
 * Buscar projetos do usuário (próprios + compartilhados)
 */
export async function fetchUserProjects(userId: string): Promise<Project[]> {
  const client = createClient();

  // Projetos próprios
  const { data: ownProjects } = await client
    .from('projects')
    .select('id, owner_id, name, color, show_on_dashboard, created_at, updated_at')
    .eq('owner_id', userId);

  // Projetos compartilhados (via project_members)
  const { data: memberProjects } = await client
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId);

  const memberProjectIds = memberProjects?.map(m => m.project_id) || [];

  let sharedProjects: Project[] = [];
  if (memberProjectIds.length > 0) {
    const { data } = await client
      .from('projects')
      .select('id, owner_id, name, color, show_on_dashboard, created_at, updated_at')
      .in('id', memberProjectIds);
    sharedProjects = data || [];
  }

  // Combinar e remover duplicatas
  const allProjects = [...(ownProjects || []), ...sharedProjects];
  const uniqueProjects = Array.from(
    new Map(allProjects.map(p => [p.id, p])).values()
  );

  return uniqueProjects;
}

/**
 * Buscar seções de um projeto
 */
export async function fetchProjectSections(projectId: number): Promise<Section[]> {
  const client = createClient();

  const { data } = await client
    .from('sections')
    .select('id, project_id, user_id, title, order, created_at')
    .eq('project_id', projectId)
    .order('order');

  return data || [];
}

/**
 * Criar seção de projeto com validação
 */
export async function createProjectSection(
  projectId: number,
  userId: string,
  title: string
): Promise<{ success: boolean; data?: Section; error?: string }> {
  if (!title.trim()) {
    return { success: false, error: 'Título não pode estar vazio' };
  }

  // Validar acesso
  const { hasAccess, isOwner } = await validateProjectAccess(projectId, userId);
  if (!hasAccess) {
    return { success: false, error: 'Acesso negado' };
  }

  const client = createClient();

  // Buscar próxima ordem
  const { data: sections } = await client
    .from('sections')
    .select('order')
    .eq('project_id', projectId)
    .order('order', { ascending: false })
    .limit(1);

  const nextOrder = (sections?.[0]?.order || 0) + 1;

  const { data, error } = await client
    .from('sections')
    .insert({
      project_id: projectId,
      user_id: userId,
      title: title.trim(),
      order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

/**
 * Atualizar seção
 */
export async function updateProjectSection(
  sectionId: number,
  projectId: number,
  userId: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  if (!title.trim()) {
    return { success: false, error: 'Título não pode estar vazio' };
  }

  // Validar acesso ao projeto
  const { hasAccess } = await validateProjectAccess(projectId, userId);
  if (!hasAccess) {
    return { success: false, error: 'Acesso negado' };
  }

  const client = createClient();

  const { error } = await client
    .from('sections')
    .update({ title: title.trim() })
    .eq('id', sectionId)
    .eq('project_id', projectId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Deletar seção
 */
export async function deleteProjectSection(
  sectionId: number,
  projectId: number,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Validar acesso
  const { hasAccess } = await validateProjectAccess(projectId, userId);
  if (!hasAccess) {
    return { success: false, error: 'Acesso negado' };
  }

  const client = createClient();

  const { error } = await client
    .from('sections')
    .delete()
    .eq('id', sectionId)
    .eq('project_id', projectId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Reordenar seções (atualizar order)
 */
export async function reorderProjectSections(
  projectId: number,
  userId: string,
  sectionIds: number[]
): Promise<{ success: boolean; error?: string }> {
  // Validar acesso
  const { hasAccess } = await validateProjectAccess(projectId, userId);
  if (!hasAccess) {
    return { success: false, error: 'Acesso negado' };
  }

  const client = createClient();

  // Atualizar order de cada seção
  const updates = sectionIds.map((id, index) =>
    client
      .from('sections')
      .update({ order: index })
      .eq('id', id)
      .eq('project_id', projectId)
  );

  const results = await Promise.all(updates);
  const hasError = results.some(r => r.error);

  if (hasError) {
    return { success: false, error: 'Erro ao reordenar seções' };
  }

  return { success: true };
}

/**
 * Formatar data para exibição
 */
export function formatDate(date: string | null, format: 'short' | 'long' = 'short'): string {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return date;

  if (format === 'short') {
    return d.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
  }

  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Validar título/conteúdo não vazio
 */
export function isValidTitle(title: string): boolean {
  return typeof title === 'string' && title.trim().length > 0;
}

/**
 * Debounce para busca
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Tratamento de erro com mensagem amigável
 */
export function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error_description) return error.error_description;
  return 'Ocorreu um erro desconhecido';
}
