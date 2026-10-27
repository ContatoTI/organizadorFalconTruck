import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/lixeira/lixeira', () => ({
  listar: vi.fn(async () => [{ id: 1 }]),
  restaurar: vi.fn(async () => true),
  excluirDeVez: vi.fn(async () => true),
}));

import * as model from '@/src/models/lixeira/lixeira';
import { listarLixeira, restaurarTarefa, excluirDefinitivo } from './lixeira';

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('lixeira', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await listarLixeira()).status).toBe(401);
    expect((await excluirDefinitivo('1')).status).toBe(401);
    expect(model.excluirDeVez).not.toHaveBeenCalled();
  });

  it('lista', async () => {
    expect(await (await listarLixeira()).json()).toEqual([{ id: 1 }]);
  });

  it('restaura e exclui de vez', async () => {
    expect((await restaurarTarefa('5')).status).toBe(204);
    expect(model.restaurar).toHaveBeenCalledWith(expect.anything(), 5);
    expect((await excluirDefinitivo('5')).status).toBe(204);
    expect(model.excluirDeVez).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it('tarefa fora da lixeira: 404', async () => {
    vi.mocked(model.restaurar).mockResolvedValueOnce(false);
    expect((await restaurarTarefa('5')).status).toBe(404);
  });

  it('id inválido: 400', async () => {
    expect((await excluirDefinitivo('abc')).status).toBe(400);
  });
});
