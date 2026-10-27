import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/habitos/habitos', async (original) => {
  const real = await original<typeof import('@/src/models/habitos/habitos')>();
  return {
    ...real,
    listar: vi.fn(async () => [{ id: 1 }]),
    marcacoesRecentes: vi.fn(async () => []),
    criar: vi.fn(async () => ({ id: 2 })),
    atualizar: vi.fn(async () => {}),
    excluir: vi.fn(async () => {}),
    marcar: vi.fn(async () => {}),
    desmarcar: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/habitos/habitos';
import {
  listarHabitos, listarMarcacoes, criarHabito, atualizarHabito, excluirHabito, marcarDia, desmarcarDia,
} from './habitos';

const req = (dados: unknown, url = 'http://x') => new Request(url, { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('login', () => {
  it('sem login nada passa', async () => {
    usuario.current = null;
    expect((await listarHabitos()).status).toBe(401);
    expect((await marcarDia('1', '2026-10-27')).status).toBe(401);
    expect(model.marcar).not.toHaveBeenCalled();
  });
});

describe('hábitos', () => {
  it('lista do usuário', async () => {
    expect(await (await listarHabitos()).json()).toEqual([{ id: 1 }]);
    expect(model.listar).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('marcações com período', async () => {
    await listarMarcacoes(new Request('http://x/api?dias=124'));
    expect(model.marcacoesRecentes).toHaveBeenCalledWith(expect.anything(), 'u1', 124);
    expect((await listarMarcacoes(new Request('http://x/api?dias=0'))).status).toBe(400);
  });

  it('cria hábito válido e recusa sem título', async () => {
    expect((await criarHabito(req({ title: 'Ler' }))).status).toBe(201);
    const resp = await criarHabito(req({ title: '' }));
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toMatch(/Título/);
  });

  it('altera só campos permitidos', async () => {
    expect((await atualizarHabito(req({ title: 'Novo', user_id: 'hack' }), '3')).status).toBe(204);
    expect(model.atualizar).toHaveBeenCalledWith(expect.anything(), 'u1', 3, { title: 'Novo' });
  });

  it('exclui pelo id', async () => {
    expect((await excluirHabito('3')).status).toBe(204);
    expect(model.excluir).toHaveBeenCalledWith(expect.anything(), 'u1', 3);
  });

  it('marca e desmarca dia', async () => {
    expect((await marcarDia('3', '2026-10-27')).status).toBe(204);
    expect(model.marcar).toHaveBeenCalledWith(expect.anything(), 'u1', 3, '2026-10-27');
    expect((await desmarcarDia('3', '2026-10-27')).status).toBe(204);
    expect(model.desmarcar).toHaveBeenCalledWith(expect.anything(), 'u1', 3, '2026-10-27');
  });

  it('dia inválido vira 400', async () => {
    expect((await marcarDia('3', 'ontem')).status).toBe(400);
    expect(model.marcar).not.toHaveBeenCalled();
  });
});
