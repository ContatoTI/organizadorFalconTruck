import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/grupos/grupos', async (original) => {
  const real = await original<typeof import('@/src/models/grupos/grupos')>();
  return {
    ...real,
    listar: vi.fn(async () => [{ id: 1 }]),
    criar: vi.fn(async () => ({ id: 2 })),
    atualizar: vi.fn(async () => {}),
    excluir: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/grupos/grupos';
import { listarGrupos, criarGrupo, atualizarGrupo, excluirGrupo } from './grupos';

const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('grupos', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await listarGrupos(new Request('http://x'))).status).toBe(401);
    expect((await excluirGrupo('1')).status).toBe(401);
    expect(model.excluir).not.toHaveBeenCalled();
  });

  it('lista na ordem pedida e recusa ordem inválida', async () => {
    await listarGrupos(new Request('http://x/api?ordem=title'));
    expect(model.listar).toHaveBeenCalledWith(expect.anything(), 'u1', 'title');
    expect((await listarGrupos(new Request('http://x/api?ordem=drop'))).status).toBe(400);
  });

  it('cria válido e recusa sem nome', async () => {
    expect((await criarGrupo(req({ title: 'Manhã', type: 'time' }))).status).toBe(201);
    expect((await criarGrupo(req({ title: '', type: 'time' }))).status).toBe(400);
  });

  it('altera só campos permitidos', async () => {
    expect((await atualizarGrupo(req({ icon: '⭐', user_id: 'x' }), '3')).status).toBe(204);
    expect(model.atualizar).toHaveBeenCalledWith(expect.anything(), 'u1', 3, { icon: '⭐' });
  });

  it('exclui', async () => {
    expect((await excluirGrupo('3')).status).toBe(204);
    expect(model.excluir).toHaveBeenCalledWith(expect.anything(), 'u1', 3);
  });
});
