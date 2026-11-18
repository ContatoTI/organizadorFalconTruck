import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/projetos/projetos', async (original) => {
  const real = await original<typeof import('@/src/models/projetos/projetos')>();
  return {
    ...real,
    listarTodos: vi.fn(async () => [{ id: 1 }]),
    listarProprioseMembro: vi.fn(async () => [{ id: 2 }]),
    criar: vi.fn(async () => ({ projeto: { id: 3 } })),
    atualizar: vi.fn(async () => true),
    excluir: vi.fn(async () => true),
    acesso: vi.fn(async () => ({ dono: true, membro: true })),
    projetosQueCompartilhei: vi.fn(async () => ['a']),
    projetosQueParticipo: vi.fn(async () => ['b']),
  };
});

import * as model from '@/src/models/projetos/projetos';
import { listarProjetos, criarProjeto, atualizarProjeto, excluirProjeto, verAcesso, resumoCompartilhados } from './projetos';

const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('projetos', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await listarProjetos(new Request('http://x'))).status).toBe(401);
    expect((await excluirProjeto('1')).status).toBe(401);
    expect(model.excluir).not.toHaveBeenCalled();
  });

  it('lista por escopo', async () => {
    expect(await (await listarProjetos(new Request('http://x/api'))).json()).toEqual([{ id: 1 }]);
    expect(await (await listarProjetos(new Request('http://x/api?escopo=basico'))).json()).toEqual([{ id: 2 }]);
    expect((await listarProjetos(new Request('http://x/api?escopo=x'))).status).toBe(400);
  });

  it('cria com pastas iniciais', async () => {
    expect((await criarProjeto(req({ nome: 'Obra', cor: '#1', pastas: ['A'] }))).status).toBe(201);
    expect(model.criar).toHaveBeenCalledWith(expect.anything(), 'u1', { nome: 'Obra', cor: '#1', pastas: ['A'] });
    expect((await criarProjeto(req({ nome: '' }))).status).toBe(400);
  });

  it('criar: devolve o projeto e, se as pastas falharem, o aviso junto', async () => {
    expect(await (await criarProjeto(req({ nome: 'Obra' }))).json()).toEqual({ id: 3 });
    vi.mocked(model.criar).mockResolvedValueOnce({ projeto: { id: 4 } as never, aviso: 'sem pastas' });
    const resp = await criarProjeto(req({ nome: 'Obra', pastas: ['A'] }));
    expect(resp.status).toBe(201);
    expect(await resp.json()).toEqual({ id: 4, aviso: 'sem pastas' });
  });

  it('alterar/excluir sem permissão: 403', async () => {
    expect((await atualizarProjeto(req({ name: 'X' }), '1')).status).toBe(204);
    vi.mocked(model.atualizar).mockResolvedValueOnce(false);
    expect((await atualizarProjeto(req({ name: 'X' }), '1')).status).toBe(403);
    vi.mocked(model.excluir).mockResolvedValueOnce(false);
    expect((await excluirProjeto('1')).status).toBe(403);
  });

  it('acesso e resumo', async () => {
    expect(await (await verAcesso('1')).json()).toEqual({ dono: true, membro: true });
    expect(await (await resumoCompartilhados()).json()).toEqual({ queCompartilhei: ['a'], queParticipo: ['b'] });
  });
});
