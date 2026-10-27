import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/metas/metas', async (original) => {
  const real = await original<typeof import('@/src/models/metas/metas')>();
  return {
    ...real,
    listar: vi.fn(async () => [{ id: 1 }]),
    tarefasDasMetas: vi.fn(async () => [{ id: 10 }]),
    criar: vi.fn(async () => ({ id: 2 })),
    atualizar: vi.fn(async () => {}),
    excluir: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/metas/metas';
import { listarMetas, listarTarefasDasMetas, criarMeta, atualizarMeta, excluirMeta } from './metas';

const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('metas', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await listarMetas()).status).toBe(401);
    expect((await excluirMeta('1')).status).toBe(401);
    expect(model.excluir).not.toHaveBeenCalled();
  });

  it('lista do usuário', async () => {
    expect(await (await listarMetas()).json()).toEqual([{ id: 1 }]);
    expect(model.listar).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('tarefas das metas pelos ids', async () => {
    const resp = await listarTarefasDasMetas(new Request('http://x/api?ids=1,2'));
    expect(await resp.json()).toEqual([{ id: 10 }]);
    expect(model.tarefasDasMetas).toHaveBeenCalledWith(expect.anything(), [1, 2]);
    expect((await listarTarefasDasMetas(new Request('http://x/api?ids=a'))).status).toBe(400);
  });

  it('cria válida e recusa sem título', async () => {
    expect((await criarMeta(req({ title: 'Saúde' }))).status).toBe(201);
    expect((await criarMeta(req({ title: ' ' }))).status).toBe(400);
  });

  it('altera só campos permitidos', async () => {
    expect((await atualizarMeta(req({ is_completed: true, user_id: 'x' }), '4')).status).toBe(204);
    expect(model.atualizar).toHaveBeenCalledWith(expect.anything(), 'u1', 4, { is_completed: true });
  });

  it('exclui', async () => {
    expect((await excluirMeta('4')).status).toBe(204);
    expect(model.excluir).toHaveBeenCalledWith(expect.anything(), 'u1', 4);
  });
});
