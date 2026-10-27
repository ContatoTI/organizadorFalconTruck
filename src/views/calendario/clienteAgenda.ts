'use client';

// Chamadas da tela às rotas /api/calendario. Mesmo formato de retorno das telas antigas.

import type { TaskOccurrence } from '@/types/index';
import { toISODate } from '@/src/lib/planning';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { EstadoOcorrencia } from '@/src/models/calendario/agenda';

const API = '/api/calendario';

export const agendaAPI = {
  /**
   * Agenda (ou reagenda) num horário exato. dueAt = null tira da agenda.
   * O dia vai calculado aqui, no fuso de quem está usando.
   */
  scheduleTask(taskId: number, dueAt: Date | null, durationMin?: number | null): Promise<Resultado> {
    const corpo: Record<string, unknown> = {
      dueAt: dueAt ? dueAt.toISOString() : null,
      dueDate: dueAt ? toISODate(dueAt) : null,
    };
    if (durationMin !== undefined) corpo.durationMin = durationMin;
    return resultado(() => chamarApi(`${API}/tarefas/${taskId}/horario`, { method: 'PATCH', json: corpo }));
  },

  /** Dia inteiro, sem horário. */
  scheduleTaskAllDay(taskId: number, day: Date): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/tarefas/${taskId}/dia-inteiro`, {
      method: 'PATCH',
      json: { dueDate: toISODate(day) },
    }));
  },

  async getOccurrences(fromISO: string, toISO: string): Promise<TaskOccurrence[]> {
    try {
      return await chamarApi<TaskOccurrence[]>(`${API}/ocorrencias?de=${fromISO}&ate=${toISO}`);
    } catch {
      return [];
    }
  },

  /** Marca (ou desmarca) UMA data da série. */
  setOccurrenceState(taskId: number, occurrenceISO: string, state: EstadoOcorrencia): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/ocorrencias/${taskId}/${occurrenceISO}`, { method: 'PUT', json: state }));
  },
};
