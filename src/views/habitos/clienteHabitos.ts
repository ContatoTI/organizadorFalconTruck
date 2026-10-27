'use client';

// Chamadas da tela às rotas /api/habitos. Mesmo formato de retorno das telas antigas.

import type { Habit, HabitLog } from '@/types/index';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { NovoHabito, AlteracaoHabito } from '@/src/models/habitos/habitos';

const API = '/api/habitos';

export const habitAPI = {
  async list(): Promise<Habit[]> {
    try {
      return await chamarApi<Habit[]>(API);
    } catch (e) {
      console.error('[habitAPI.list]', e);
      return [];
    }
  },

  /** Marcações dos últimos `days` dias — é só o que a grade precisa mostrar. */
  async recentLogs(days = 120): Promise<HabitLog[]> {
    try {
      return await chamarApi<HabitLog[]>(`${API}/marcacoes?dias=${days}`);
    } catch (e) {
      console.error('[habitAPI.recentLogs]', e);
      return [];
    }
  },

  async create(input: NovoHabito): Promise<Resultado & { data?: Habit }> {
    try {
      return { success: true, data: await chamarApi<Habit>(API, { method: 'POST', json: input }) };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },

  update(habitId: number, updates: AlteracaoHabito): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${habitId}`, { method: 'PATCH', json: updates }));
  },

  /** Arquiva em vez de apagar — o histórico do que você já fez fica de pé. */
  archive(habitId: number): Promise<Resultado> {
    return habitAPI.update(habitId, { archived_at: new Date().toISOString() });
  },

  remove(habitId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${habitId}`, { method: 'DELETE' }));
  },

  /** Marca o dia. Idempotente: marcar de novo não duplica nem dá erro. */
  mark(habitId: number, day: string): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${habitId}/marcacoes/${day}`, { method: 'PUT' }));
  },

  unmark(habitId: number, day: string): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${habitId}/marcacoes/${day}`, { method: 'DELETE' }));
  },
};
