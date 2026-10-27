'use client';

// Chamadas da tela às rotas /api/compartilhamentos. Mesmo formato de retorno das telas antigas.

import type { SectionShare, TaskShare, User } from '@/types/index';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { TipoCompartilhamento } from '@/src/models/compartilhamentos/compartilhamentos';

const API = '/api/compartilhamentos';

async function ouVazio<T>(acao: () => Promise<T[]>): Promise<T[]> {
  try {
    return await acao();
  } catch (e) {
    console.error('[shareAPI]', e);
    return [];
  }
}

const acesso = (tipo: TipoCompartilhamento, id: number, usuarioId: string) =>
  `${API}/${tipo}/${id}/usuarios/${usuarioId}`;

export const shareAPI = {
  shareSection: (sectionId: number, userId: string) =>
    resultado(() => chamarApi(acesso('pasta', sectionId, userId), { method: 'PUT' })),

  unshareSection: (sectionId: number, userId: string) =>
    resultado(() => chamarApi(acesso('pasta', sectionId, userId), { method: 'DELETE' })),

  getSectionShares: (sectionId: number) =>
    ouVazio(() => chamarApi<SectionShare[]>(`${API}/pasta/${sectionId}`)),

  /** Dono automático da pasta (null remove). Já dá acesso à pasta para a pessoa. */
  setSectionDefaultAssignee: (sectionId: number, userId: string | null) =>
    resultado(() => chamarApi(`${API}/pasta/${sectionId}/responsavel`, { method: 'PATCH', json: { usuarioId: userId } })),

  shareTask: (taskId: number, userId: string) =>
    resultado(() => chamarApi(acesso('tarefa', taskId, userId), { method: 'PUT' })),

  unshareTask: (taskId: number, userId: string) =>
    resultado(() => chamarApi(acesso('tarefa', taskId, userId), { method: 'DELETE' })),

  getTaskShares: (taskId: number) =>
    ouVazio(() => chamarApi<TaskShare[]>(`${API}/tarefa/${taskId}`)),

  /** Pessoas que aparecem na lista para compartilhar. */
  getUsers: () => ouVazio(() => chamarApi<User[]>(`${API}/usuarios`)),

  /** Suas pastas compartilhadas e as compartilhadas com você. */
  async getSectionsSummary(): Promise<{ queCompartilhei: any[]; comigo: any[] }> {
    try {
      return await chamarApi(`${API}/pastas`);
    } catch (e) {
      console.error('[shareAPI.getSectionsSummary]', e);
      return { queCompartilhei: [], comigo: [] };
    }
  },
};
