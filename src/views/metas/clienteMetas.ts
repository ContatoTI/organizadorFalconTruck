'use client';

// Chamadas da tela às rotas /api/metas. Mesmo formato de retorno das telas antigas.

import type { Goal, Task } from '@/types/index';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { NovaMeta, AlteracaoMeta } from '@/src/models/metas/metas';

const API = '/api/metas';

export const goalAPI = {
  async list(): Promise<Goal[]> {
    try {
      return await chamarApi<Goal[]>(API);
    } catch (e) {
      console.error('[goalAPI.list]', e);
      return [];
    }
  },

  async create(input: NovaMeta): Promise<Resultado & { data?: Goal }> {
    try {
      return { success: true, data: await chamarApi<Goal>(API, { method: 'POST', json: input }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },

  update(goalId: number, updates: AlteracaoMeta): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${goalId}`, { method: 'PATCH', json: updates }));
  },

  /** Apaga junto os sub-objetivos; as tarefas só se soltam. */
  remove(goalId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${goalId}`, { method: 'DELETE' }));
  },

  /** Move um objetivo para debaixo de outro (ou para o topo, com null). */
  move(goalId: number, newParentId: number | null): Promise<Resultado> {
    return goalAPI.update(goalId, { parent_id: newParentId });
  },

  /** Tarefas ligadas a qualquer nó da árvore do usuário. */
  async tasksForGoals(goalIds: number[]): Promise<Task[]> {
    if (goalIds.length === 0) return [];
    try {
      return await chamarApi<Task[]>(`${API}/tarefas?ids=${goalIds.join(',')}`);
    } catch {
      return [];
    }
  },
};
