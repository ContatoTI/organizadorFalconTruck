'use client';

// Chamadas da tela às rotas /api/projetos. Mesmo formato de retorno das telas antigas.

import type { Project, ProjectMember, Section } from '@/types/index';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { AlteracaoProjeto } from '@/src/models/projetos/projetos';
import type { AlteracaoPasta } from '@/src/models/projetos/pastas';

const API = '/api/projetos';

async function ouVazio<T>(nome: string, acao: () => Promise<T[]>): Promise<T[]> {
  try {
    return await acao();
  } catch (e) {
    console.error(`[projectAPI.${nome}]`, e);
    return [];
  }
}

export const projectAPI = {
  /** Todos os projetos que aparecem para você (dono, membro ou por pasta/tarefa compartilhada). */
  getUserProjects: () => ouVazio('getUserProjects', () => chamarApi<Project[]>(API)),

  /** Só dono/membro, colunas resumidas (tela inicial e calendário). */
  getOwnAndMemberProjects: () => ouVazio('getOwnAndMemberProjects', () => chamarApi<Project[]>(`${API}?escopo=basico`)),

  async createProject(title: string, color: string, sectionTitles: string[] = []): Promise<Resultado & { data?: Project }> {
    try {
      return { success: true, data: await chamarApi<Project>(API, { method: 'POST', json: { nome: title, cor: color, pastas: sectionTitles } }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },

  updateProject: (projectId: number, data: AlteracaoProjeto) =>
    resultado(() => chamarApi(`${API}/${projectId}`, { method: 'PATCH', json: data })),

  /** As tarefas do projeto voltam para a Caixa de Entrada. */
  deleteProject: (projectId: number) =>
    resultado(() => chamarApi(`${API}/${projectId}`, { method: 'DELETE' })),

  async getAccess(projectId: number): Promise<{ dono: boolean; membro: boolean }> {
    try {
      return await chamarApi(`${API}/${projectId}/acesso`);
    } catch (e) {
      console.error('[projectAPI.getAccess]', e);
      return { dono: false, membro: false };
    }
  },

  async isProjectOwner(projectId: number): Promise<boolean> {
    return (await projectAPI.getAccess(projectId)).dono;
  },

  async isProjectMember(projectId: number): Promise<boolean> {
    return (await projectAPI.getAccess(projectId)).membro;
  },

  /** Membros e ids com convite pendente. */
  async getMembersAndInvites(projectId: number): Promise<{ membros: ProjectMember[]; pendentes: string[] }> {
    try {
      return await chamarApi(`${API}/${projectId}/membros`);
    } catch (e) {
      console.error('[projectAPI.getMembersAndInvites]', e);
      return { membros: [], pendentes: [] };
    }
  },

  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    return (await projectAPI.getMembersAndInvites(projectId)).membros;
  },

  inviteUserToProject: (projectId: number, invitedUserId: string) =>
    resultado(() => chamarApi(`${API}/${projectId}/convites/${invitedUserId}`, { method: 'PUT' })),

  cancelInvite: (projectId: number, invitedUserId: string) =>
    resultado(() => chamarApi(`${API}/${projectId}/convites/${invitedUserId}`, { method: 'DELETE' })),

  /** Convida de novo quem recusou. */
  reinvite: (projectId: number, invitedUserId: string) =>
    resultado(() => chamarApi(`${API}/${projectId}/convites/${invitedUserId}/reenviar`, { method: 'POST' })),

  /** Apaga o aviso "fulano recusou". */
  dismissDecline: (inviteId: number) =>
    resultado(() => chamarApi(`${API}/convites-recusados/${inviteId}`, { method: 'DELETE' })),

  removeProjectMember: (projectId: number, userId: string) =>
    resultado(() => chamarApi(`${API}/${projectId}/membros/${userId}`, { method: 'DELETE' })),

  /** Página de Compartilhamentos. */
  async getSharedSummary(): Promise<{ queCompartilhei: any[]; queParticipo: any[] }> {
    try {
      return await chamarApi(`${API}/compartilhados`);
    } catch (e) {
      console.error('[projectAPI.getSharedSummary]', e);
      return { queCompartilhei: [], queParticipo: [] };
    }
  },
};

export const sectionAPI = {
  list: (projectId: number) => ouVazio('sections', () => chamarApi<Section[]>(`${API}/${projectId}/pastas`)),

  async create(
    projectId: number,
    input: { title: string; color?: string | null; defaultAssigneeId?: string | null },
  ): Promise<Resultado & { data?: Section }> {
    try {
      return { success: true, data: await chamarApi<Section>(`${API}/${projectId}/pastas`, { method: 'POST', json: input }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },

  updateSection: (sectionId: number, updates: AlteracaoPasta) =>
    resultado(() => chamarApi(`${API}/pastas/${sectionId}`, { method: 'PATCH', json: updates })),

  /** As tarefas da pasta voltam para a Caixa de Entrada. */
  deleteSection: (sectionId: number) =>
    resultado(() => chamarApi(`${API}/pastas/${sectionId}`, { method: 'DELETE' })),

  reorderSections: (sectionId: number, targetIndex: number) =>
    resultado(() => chamarApi(`${API}/pastas/${sectionId}/mover`, { method: 'PATCH', json: { indice: targetIndex } })),

  moveSectionToProject: (sectionId: number, targetProjectId: number) =>
    resultado(() => chamarApi(`${API}/pastas/${sectionId}/mover`, { method: 'PATCH', json: { projetoId: targetProjectId } })),
};
