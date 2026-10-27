import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/preferencias/preferencias', async (original) => {
  const real = await original<typeof import('@/src/models/preferencias/preferencias')>();
  return { ...real, buscar: vi.fn(async () => real.PADRAO), salvar: vi.fn(async () => {}) };
});

import * as model from '@/src/models/preferencias/preferencias';
import { buscarPreferencias, salvarPreferencias } from './preferencias';

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('preferências', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await buscarPreferencias()).status).toBe(401);
  });

  it('busca e salva normalizado para o usuário logado', async () => {
    expect(await (await buscarPreferencias()).json()).toEqual(model.PADRAO);
    const req = new Request('http://x', { method: 'PUT', body: JSON.stringify({ focus_mode: false, lixo: 1 }) });
    expect((await salvarPreferencias(req)).status).toBe(204);
    expect(model.salvar).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ focus_mode: false }));
  });
});
