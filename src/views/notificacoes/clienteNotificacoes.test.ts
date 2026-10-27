import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationAPI } from './clienteNotificacoes';

const resposta = (corpo: unknown, status = 200) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status });

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async () => resposta(null, 204));
  vi.stubGlobal('fetch', fetchFalso);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('notificationAPI (tela)', () => {
  it('aceitar e recusar convite nas rotas certas', async () => {
    expect(await notificationAPI.acceptInvite(4)).toEqual({ success: true });
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/notificacoes/convites/4/aceitar', { method: 'POST' });
    await notificationAPI.declineInvite(4);
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/notificacoes/convites/4/recusar', { method: 'POST' });
  });

  it('criar aviso nunca lança', async () => {
    fetchFalso.mockImplementation(async () => resposta({ erro: 'x' }, 500));
    await expect(notificationAPI.createTaskReviewNotification('u2', 3, 'T', 'Ana', 'assigned')).resolves.toBeUndefined();
    expect(JSON.parse(String(fetchFalso.mock.calls[0][1].body))).toEqual(
      { userId: 'u2', taskId: 3, taskTitle: 'T', senderName: 'Ana', type: 'assigned', note: null },
    );
  });

  it('erros na listagem viram vazio', async () => {
    fetchFalso.mockImplementation(async () => resposta({ erro: 'x' }, 500));
    expect(await notificationAPI.getUserNotifications()).toEqual({ pendingInvites: [], declineNotifications: [] });
    expect(await notificationAPI.getTaskReviewNotifications()).toEqual([]);
  });

  it('resolver revisão manda decisão e observação', async () => {
    await notificationAPI.resolveTaskReview(9, 3, false, 'Rev', 'ajustar');
    expect(fetchFalso.mock.lastCall?.[0]).toBe('/api/notificacoes/avisos/9/resolver');
    expect(JSON.parse(String(fetchFalso.mock.lastCall?.[1].body))).toEqual({ taskId: 3, approve: false, reviewerName: 'Rev', note: 'ajustar' });
  });
});
