'use client';

/**
 * Chamadas das telas às rotas /api/tarefas. Mesmos nomes e formatos de
 * retorno do taskAPI antigo; quem é o usuário vem do login, no servidor.
 *
 * As datas ("hoje", adiamento) são calculadas AQUI, no fuso de quem usa —
 * o servidor pode estar em outro fuso.
 */

import type { PlanHorizon, RecurFreq, Task } from '@/types/index';
import { toISODate } from '@/src/lib/planning';
import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type { AlteracaoTarefa, NovaTarefa, RegraRepeticao } from '@/src/models/tarefas/escrita';

const API = '/api/tarefas';
const hoje = () => toISODate(new Date());

export interface FiltrosTela {
  projectId?: number;
  sectionId?: number;
  groupId?: number;
  onlyToday?: boolean;
  showCompleted?: boolean;
}

async function criarComResultado(input: NovaTarefa): Promise<Resultado & { data?: Task }> {
  try {
    return { success: true, data: await chamarApi<Task>(API, { method: 'POST', json: input }) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export const taskAPI = {
  async getUserTasks(filters?: FiltrosTela): Promise<Task[]> {
    const busca = new URLSearchParams({ hoje: hoje() });
    if (filters?.projectId) busca.set('projetoId', String(filters.projectId));
    if (filters?.sectionId) busca.set('pastaId', String(filters.sectionId));
    if (filters?.groupId) busca.set('grupoId', String(filters.groupId));
    if (filters?.onlyToday) busca.set('soHoje', '1');
    if (filters?.showCompleted) busca.set('concluidas', '1');
    try {
      return await chamarApi<Task[]>(`${API}?${busca}`);
    } catch (e) {
      console.error('Erro ao buscar tarefas:', e);
      return [];
    }
  },

  async getTask(taskId: number): Promise<Task | null> {
    try {
      return await chamarApi<Task>(`${API}/${taskId}?hoje=${hoje()}`);
    } catch {
      return null;
    }
  },

  /** Tarefas que você delegou e ainda não voltaram. */
  async getWaitingTasks(): Promise<Task[]> {
    try {
      return await chamarApi<Task[]>(`${API}/aguardando`);
    } catch {
      return [];
    }
  },

  /** Criação simples (lista/kanban). */
  createTask(
    title: string,
    projectId?: number,
    sectionId?: number,
    groupId?: number,
    dueDate?: string,
    description?: string | null,
    priority?: string,
    status?: string,
  ): Promise<Resultado & { data?: Task }> {
    return criarComResultado({
      title,
      projectId: projectId ?? null,
      sectionId: sectionId ?? null,
      groupId: groupId ?? null,
      dueDate: dueDate ?? null,
      description: description ?? null,
      priority: priority ?? null,
      status: status ?? null,
    });
  },

  /** Criação completa (captura rápida, calendário, metas): aceita horário, repetição etc. */
  createTaskFrom(input: NovaTarefa): Promise<Resultado & { data?: Task }> {
    return criarComResultado(input);
  },

  updateTask(taskId: number, updates: AlteracaoTarefa): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}`, { method: 'PATCH', json: updates }));
  },

  async toggleTaskCompletion(taskId: number, currentState: boolean): Promise<Resultado & { newState?: boolean }> {
    const newState = !currentState;
    const res = await resultado(() => chamarApi(`${API}/${taskId}/conclusao`, { method: 'PATCH', json: { concluida: newState } }));
    return res.success ? { ...res, newState } : res;
  },

  /** Exclui para a Lixeira. Só o criador ou quem participa do projeto. */
  deleteTask(taskId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}`, { method: 'DELETE' }));
  },

  /** Move para um grupo (null = Caixa de Entrada), saindo do projeto. */
  moveTaskToGroup(taskId: number, targetGroupId: number | null): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/mover`, {
      method: 'PATCH',
      json: { destino: 'grupo', grupoId: targetGroupId },
    }));
  },

  moveTaskToProject(taskId: number, targetProjectId: number | null, targetSectionId: number | null = null): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/mover`, {
      method: 'PATCH',
      json: { destino: 'projeto', projetoId: targetProjectId, pastaId: targetSectionId },
    }));
  },

  /** Arrastar e soltar: move para a pasta e reordena as posições. */
  moveTaskAndReorder(
    taskId: number,
    targetSectionId: number | null,
    targetIndex: number,
    projectId: number | null,
    groupId: number | null = null,
  ): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/reordenar`, {
      method: 'POST',
      json: { pastaId: targetSectionId, indice: targetIndex, projetoId: projectId, grupoId: groupId },
    }));
  },

  /** Vincula ao grupo sem tirar do projeto. */
  linkTaskToGroup(taskId: number, groupId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/grupos/${groupId}`, { method: 'PUT' }));
  },

  /** Tira do grupo por completo (campo direto + vínculo), sem tirar do projeto. */
  removeTaskFromGroup(taskId: number, groupId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/grupos/${groupId}?direto=1`, { method: 'DELETE' }));
  },

  /** Desfaz só o vínculo extra com o grupo. */
  unlinkTaskFromGroup(taskId: number, groupId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/grupos/${groupId}`, { method: 'DELETE' }));
  },

  async getLinkedGroupIds(taskId: number): Promise<number[]> {
    try {
      return await chamarApi<number[]>(`${API}/${taskId}/grupos`);
    } catch {
      return [];
    }
  },

  /** Adia para um horizonte; a data âncora vira AAAA-MM-DD no SEU fuso. */
  deferTask(taskId: number, horizon: PlanHorizon | null, anchorDate: Date | null): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/adiar`, {
      method: 'PATCH',
      json: horizon && anchorDate
        ? { horizonte: horizon, planDate: toISODate(anchorDate) }
        : { horizonte: null, planDate: null },
    }));
  },

  /** Passa a tarefa para outra pessoa (null devolve para você). */
  delegateTask(taskId: number, assigneeId: string | null): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/delegar`, { method: 'PATCH', json: { responsavelId: assigneeId } }));
  },

  /** Define (ou tira, com freq null) a repetição. */
  setRecurrence(
    taskId: number,
    rule: { freq: RecurFreq | null } & Omit<RegraRepeticao, 'freq'>,
  ): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/${taskId}/repeticao`, { method: 'PATCH', json: rule }));
  },
};
