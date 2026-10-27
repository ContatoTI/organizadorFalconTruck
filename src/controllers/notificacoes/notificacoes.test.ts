import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/notificacoes/notificacoes', async (original) => {
  const real = await original<typeof import('@/src/models/notificacoes/notificacoes')>();
  return {
    ...real,
    convitesERecusas: vi.fn(async () => ({ pendingInvites: [1], declineNotifications: [2] })),
    avisosNaoLidos: vi.fn(async () => [3]),
    aceitarConvite: vi.fn(async () => {}),
    recusarConvite: vi.fn(async () => {}),
    criarAviso: vi.fn(async () => {}),
    dispensarAviso: vi.fn(async () => {}),
    resolverRevisao: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/notificacoes/notificacoes';
import {
  listarConvites, listarAvisos, aceitarConvite, recusarConvite, criarAviso, dispensarAviso, resolverRevisao,
} from './notificacoes';

const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('notificações', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await listarConvites()).status).toBe(401);
    expect((await listarAvisos()).status).toBe(401);
    expect((await aceitarConvite('1')).status).toBe(401);
    expect(model.aceitarConvite).not.toHaveBeenCalled();
  });

  it('lista convites e avisos do usuário', async () => {
    expect(await (await listarConvites()).json()).toEqual({ pendingInvites: [1], declineNotifications: [2] });
    expect(await (await listarAvisos()).json()).toEqual([3]);
    expect(model.avisosNaoLidos).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('aceita e recusa convite do usuário logado', async () => {
    expect((await aceitarConvite('4')).status).toBe(204);
    expect(model.aceitarConvite).toHaveBeenCalledWith(expect.anything(), 'u1', 4);
    expect((await recusarConvite('4')).status).toBe(204);
    expect(model.recusarConvite).toHaveBeenCalledWith(expect.anything(), 'u1', 4);
  });

  it('convite já usado vira 400 com a mensagem', async () => {
    vi.mocked(model.aceitarConvite).mockRejectedValueOnce(new model.ErroNegocio('Convite já foi processado'));
    const resp = await aceitarConvite('4');
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toBe('Convite já foi processado');
  });

  it('cria aviso válido e recusa inválido', async () => {
    expect((await criarAviso(req({ userId: 'u2', taskId: 3, taskTitle: 'T', type: 'assigned' }))).status).toBe(201);
    expect((await criarAviso(req({ userId: 'u2', taskId: 3, taskTitle: 'T', type: 'spam' }))).status).toBe(400);
  });

  it('dispensa aviso', async () => {
    expect((await dispensarAviso('7')).status).toBe(204);
    expect(model.dispensarAviso).toHaveBeenCalledWith(expect.anything(), 'u1', 7);
  });

  it('resolve revisão com o revisor logado', async () => {
    const resp = await resolverRevisao(req({ taskId: 3, approve: false, reviewerName: 'Rev', note: 'ajustar' }), '9');
    expect(resp.status).toBe(204);
    expect(model.resolverRevisao).toHaveBeenCalledWith(expect.anything(), { id: 'u1', nome: 'Rev' }, 9, 3, false, 'ajustar');
  });
});
