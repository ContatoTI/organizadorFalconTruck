import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'eu' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/perfis/perfis', async (original) => {
  const real = await original<typeof import('@/src/models/perfis/perfis')>();
  return { ...real, listar: vi.fn(async () => [{ id: 'p1' }]) };
});

import * as model from '@/src/models/perfis/perfis';
import { listarPerfis } from './perfis';

const UID = '11111111-1111-1111-1111-111111111111';
const req = (busca = '') => new Request(`http://x/api/perfis${busca}`);

beforeEach(() => {
  usuario.current = { id: 'eu' };
  vi.clearAllMocks();
});

describe('listarPerfis', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await listarPerfis(req())).status).toBe(401);
  });

  it('padrão: 50 pessoas, incluindo você', async () => {
    expect(await (await listarPerfis(req())).json()).toEqual([{ id: 'p1' }]);
    expect(model.listar).toHaveBeenCalledWith(expect.anything(), { ids: undefined, excluirId: undefined, limite: 50 });
  });

  it('excluirEu usa o usuário logado', async () => {
    await listarPerfis(req(`?excluirEu=1&limite=500&ids=${UID}`));
    expect(model.listar).toHaveBeenCalledWith(expect.anything(), { ids: [UID], excluirId: 'eu', limite: 500 });
  });

  it('filtro inválido: 400', async () => {
    expect((await listarPerfis(req('?limite=9999'))).status).toBe(400);
    expect(model.listar).not.toHaveBeenCalled();
  });
});
