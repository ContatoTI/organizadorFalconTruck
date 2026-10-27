'use client';

// Chamadas da tela às rotas /api/grupos.

import type { Group } from '@/types/index';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { DadosGrupo, OrdemGrupos } from '@/src/models/grupos/grupos';

const API = '/api/grupos';

export const grupoAPI = {
  list(ordem: OrdemGrupos = 'created_at'): Promise<Group[]> {
    return chamarApi<Group[]>(`${API}?ordem=${ordem}`);
  },

  async create(dados: DadosGrupo): Promise<Resultado & { data?: Group }> {
    try {
      return { success: true, data: await chamarApi<Group>(API, { method: 'POST', json: dados }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },

  update(id: number, dados: DadosGrupo): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${id}`, { method: 'PATCH', json: dados }));
  },

  /** As tarefas do grupo voltam para a Caixa de Entrada. */
  remove(id: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${id}`, { method: 'DELETE' }));
  },
};
