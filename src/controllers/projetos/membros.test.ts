import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/projetos/membros', () => ({
  listarMembros: vi.fn(async () => [{ id: 1 }]),
  convitesPendentes: vi.fn(async () => ['p2']),
  removerMembro: vi.fn(async () => {}),
  convidar: vi.fn(async () => {}),
  cancelarConvitePendente: vi.fn(async () => {}),
  reconvidar: vi.fn(async () => {}),
  apagarConviteRecusado: vi.fn(async () => {}),
}));

import * as model from '@/src/models/projetos/membros';
import { ErroValidacao } from '@/src/lib/erros';
import { listarMembros, removerMembro, convidar, cancelarConvite, reconvidar, apagarRecusa } from './membros';

const UID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('membros', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await convidar('5', UID)).status).toBe(401);
    expect(model.convidar).not.toHaveBeenCalled();
  });

  it('lista membros e pendentes', async () => {
    expect(await (await listarMembros('5')).json()).toEqual({ membros: [{ id: 1 }], pendentes: ['p2'] });
  });

  it('convida em nome de quem está logado', async () => {
    expect((await convidar('5', UID)).status).toBe(201);
    expect(model.convidar).toHaveBeenCalledWith(expect.anything(), 5, UID, 'u1');
    await reconvidar('5', UID);
    expect(model.reconvidar).toHaveBeenCalledWith(expect.anything(), 5, UID, 'u1');
  });

  it('regra recusada vira 400 com a mensagem', async () => {
    vi.mocked(model.removerMembro).mockRejectedValueOnce(new ErroValidacao('Apenas o dono pode remover membros'));
    const resp = await removerMembro('5', UID);
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toBe('Apenas o dono pode remover membros');
  });

  it('cancela convite e apaga recusa', async () => {
    expect((await cancelarConvite('5', UID)).status).toBe(204);
    expect((await apagarRecusa('8')).status).toBe(204);
    expect(model.apagarConviteRecusado).toHaveBeenCalledWith(expect.anything(), 8);
  });

  it('usuário inválido: 400', async () => {
    expect((await convidar('5', 'abc')).status).toBe(400);
  });
});
