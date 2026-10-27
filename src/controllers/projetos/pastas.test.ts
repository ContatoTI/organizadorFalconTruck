import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/projetos/pastas', async (original) => {
  const real = await original<typeof import('@/src/models/projetos/pastas')>();
  return {
    ...real,
    listar: vi.fn(async () => [{ id: 1 }]),
    criar: vi.fn(async () => ({ id: 2 })),
    atualizar: vi.fn(async () => {}),
    excluir: vi.fn(async () => {}),
    reordenar: vi.fn(async () => {}),
    moverParaProjeto: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/projetos/pastas';
import { listarPastas, criarPasta, atualizarPasta, excluirPasta, moverPasta } from './pastas';

const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('pastas', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await excluirPasta('1')).status).toBe(401);
    expect(model.excluir).not.toHaveBeenCalled();
  });

  it('lista e cria', async () => {
    expect(await (await listarPastas('5')).json()).toEqual([{ id: 1 }]);
    expect((await criarPasta(req({ title: 'A' }), '5')).status).toBe(201);
    expect(model.criar).toHaveBeenCalledWith(expect.anything(), 'u1', 5, { title: 'A', color: null, defaultAssigneeId: null });
    expect((await criarPasta(req({ title: '' }), '5')).status).toBe(400);
  });

  it('altera e exclui', async () => {
    expect((await atualizarPasta(req({ title: 'B' }), '7')).status).toBe(204);
    expect((await excluirPasta('7')).status).toBe(204);
  });

  it('mover: posição ou outro projeto', async () => {
    await moverPasta(req({ indice: 2 }), '7');
    expect(model.reordenar).toHaveBeenCalledWith(expect.anything(), 7, 2);
    await moverPasta(req({ projetoId: 9 }), '7');
    expect(model.moverParaProjeto).toHaveBeenCalledWith(expect.anything(), 7, 9);
    expect((await moverPasta(req({ indice: -1 }), '7')).status).toBe(400);
  });
});
