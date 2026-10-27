'use client';

// Chamadas da tela às rotas /api/notificacoes. Mesmo formato de retorno das telas antigas.

import { chamarApi, comoResultado as resultado, type Resultado } from '@/src/lib/chamarApi';
import type {
  PendingInvite, DeclineNotification, TaskReviewNotification,
} from '@/src/models/notificacoes/notificacoes';

export type { PendingInvite, DeclineNotification, TaskReviewNotification };

const API = '/api/notificacoes';

export const notificationAPI = {
  async getUserNotifications(): Promise<{ pendingInvites: PendingInvite[]; declineNotifications: DeclineNotification[] }> {
    try {
      return await chamarApi(`${API}/convites`);
    } catch (e) {
      console.error('[notificationAPI] convites:', e);
      return { pendingInvites: [], declineNotifications: [] };
    }
  },

  async getPendingInvites(): Promise<PendingInvite[]> {
    return (await notificationAPI.getUserNotifications()).pendingInvites;
  },

  async getTaskReviewNotifications(): Promise<TaskReviewNotification[]> {
    try {
      return await chamarApi<TaskReviewNotification[]>(`${API}/avisos`);
    } catch (e) {
      console.error('[notificationAPI] avisos:', e);
      return [];
    }
  },

  /** Nunca falha para quem chama: aviso não enviado só vai para o log. */
  async createTaskReviewNotification(
    userId: string,
    taskId: number,
    taskTitle: string,
    senderName: string,
    type: string = 'review',
    note?: string,
  ): Promise<void> {
    const res = await resultado(() => chamarApi(`${API}/avisos`, {
      method: 'POST',
      json: { userId, taskId, taskTitle, senderName, type, note: note || null },
    }));
    if (!res.success) console.error('[notificationAPI] Erro ao criar notificação de tarefa:', res.error);
  },

  async dismissTaskReviewNotification(id: number): Promise<void> {
    const res = await resultado(() => chamarApi(`${API}/avisos/${id}`, { method: 'DELETE' }));
    if (!res.success) console.error('[notificationAPI] Erro ao dispensar aviso:', res.error);
  },

  /** Aprova ou reprova a tarefa direto pela notificação. */
  resolveTaskReview(notifId: number, taskId: number, approve: boolean, reviewerName: string, note?: string): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/avisos/${notifId}/resolver`, {
      method: 'POST',
      json: { taskId, approve, reviewerName, note: note ?? null },
    }));
  },

  acceptInvite(inviteId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/convites/${inviteId}/aceitar`, { method: 'POST' }));
  },

  declineInvite(inviteId: number): Promise<Resultado> {
    return resultado(() => chamarApi(`${API}/convites/${inviteId}/recusar`, { method: 'POST' }));
  },
};
