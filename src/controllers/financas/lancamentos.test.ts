import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/financas/lancamentos', async (original) => {
  const real = await original<typeof import('@/src/models/financas/lancamentos')>();
  return {
    ...real,
    listar: vi.fn(async () => [{ id: 1 }]),
    criar: vi.fn(async () => ({ id: 2 })),
    atualizar: vi.fn(async () => ({ id: 3 })),
    excluir: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/financas/lancamentos';
import { listarLancamentos, criarLancamento, atualizarLancamento, excluirLancamento } from './lancamentos';

const corpo = { description: 'Salário', amount: 1000, type: 'income', category: null, date: '2026-10-01' };
const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('login', () => {
  it('sem login não lista nem grava', async () => {
    usuario.current = null;
    expect((await listarLancamentos()).status).toBe(401);
    expect((await criarLancamento(req(corpo))).status).toBe(401);
    expect(model.criar).not.toHaveBeenCalled();
  });
});

describe('lançamentos', () => {
  it('lista do usuário logado', async () => {
    const resp = await listarLancamentos();
    expect(await resp.json()).toEqual([{ id: 1 }]);
    expect(model.listar).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('cria lançamento válido', async () => {
    const resp = await criarLancamento(req(corpo));
    expect(resp.status).toBe(201);
    expect(model.criar).toHaveBeenCalledWith(expect.anything(), 'u1', corpo);
  });

  it('recusa lançamento inválido com mensagem', async () => {
    const resp = await criarLancamento(req({ ...corpo, description: '' }));
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toMatch(/descrição/);
    expect(model.criar).not.toHaveBeenCalled();
  });

  it('recusa corpo que não é JSON', async () => {
    const resp = await criarLancamento(new Request('http://x', { method: 'POST', body: 'xx' }));
    expect(resp.status).toBe(400);
  });

  it('atualiza e devolve 404 se não for do usuário', async () => {
    expect((await atualizarLancamento(req(corpo), '3')).status).toBe(200);
    vi.mocked(model.atualizar).mockResolvedValueOnce(null);
    expect((await atualizarLancamento(req(corpo), '3')).status).toBe(404);
  });

  it('exclui pelo id', async () => {
    expect((await excluirLancamento('5')).status).toBe(204);
    expect(model.excluir).toHaveBeenCalledWith(expect.anything(), 'u1', 5);
  });

  it('id inválido vira 400', async () => {
    expect((await excluirLancamento('x')).status).toBe(400);
  });
});
