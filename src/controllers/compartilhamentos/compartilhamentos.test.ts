import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/compartilhamentos/compartilhamentos', async (original) => {
  const real = await original<typeof import('@/src/models/compartilhamentos/compartilhamentos')>();
  return {
    ...real,
    pastasQueCompartilhei: vi.fn(async () => [{ a: 1 }]),
    pastasCompartilhadasComigo: vi.fn(async () => [{ b: 2 }]),
    usuariosParaCompartilhar: vi.fn(async () => []),
    listarAcessos: vi.fn(async () => [{ user_id: 'x' }]),
    compartilhar: vi.fn(async () => {}),
    descompartilhar: vi.fn(async () => {}),
    definirResponsavelPadrao: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/compartilhamentos/compartilhamentos';
import { resumoPastas, listarUsuarios, listarAcessos, darAcesso, removerAcesso, definirResponsavel } from './compartilhamentos';

const UID = '11111111-1111-1111-1111-111111111111';
const req = (dados: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('compartilhamentos', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await resumoPastas()).status).toBe(401);
    expect((await darAcesso('pasta', '1', UID)).status).toBe(401);
    expect(model.compartilhar).not.toHaveBeenCalled();
  });

  it('resumo junta as duas listas', async () => {
    expect(await (await resumoPastas()).json()).toEqual({ queCompartilhei: [{ a: 1 }], comigo: [{ b: 2 }] });
  });

  it('lista pessoas e acessos', async () => {
    expect((await listarUsuarios()).status).toBe(200);
    expect(model.usuariosParaCompartilhar).toHaveBeenCalledWith(expect.anything(), 'u1');
    await listarAcessos('tarefa', '7');
    expect(model.listarAcessos).toHaveBeenCalledWith(expect.anything(), 'tarefa', 7);
  });

  it('dá e remove acesso', async () => {
    expect((await darAcesso('pasta', '3', UID)).status).toBe(204);
    expect(model.compartilhar).toHaveBeenCalledWith(expect.anything(), 'pasta', 3, UID);
    expect((await removerAcesso('pasta', '3', UID)).status).toBe(204);
    expect(model.descompartilhar).toHaveBeenCalledWith(expect.anything(), 'pasta', 3, UID);
  });

  it('recusa tipo ou usuário inválido', async () => {
    expect((await darAcesso('projeto', '3', UID)).status).toBe(400);
    expect((await darAcesso('pasta', '3', 'abc')).status).toBe(400);
    expect(model.compartilhar).not.toHaveBeenCalled();
  });

  it('define e remove responsável da pasta', async () => {
    expect((await definirResponsavel(req({ usuarioId: UID }), 'pasta', '3')).status).toBe(204);
    expect(model.definirResponsavelPadrao).toHaveBeenCalledWith(expect.anything(), 3, UID);
    await definirResponsavel(req({ usuarioId: null }), 'pasta', '3');
    expect(model.definirResponsavelPadrao).toHaveBeenLastCalledWith(expect.anything(), 3, null);
  });
});

describe('responsável', () => {
  it('tarefa não tem responsável padrão', async () => {
    expect((await definirResponsavel(req({ usuarioId: UID }), 'tarefa', '3')).status).toBe(404);
    expect(model.definirResponsavelPadrao).not.toHaveBeenCalled();
  });
});
