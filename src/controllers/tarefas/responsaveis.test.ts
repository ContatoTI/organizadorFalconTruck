import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'dono', email: 'dono@x', user_metadata: { full_name: 'Dono' } } as Record<string, unknown> | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/tarefas/responsaveis', async (original) => {
  const real = await original<typeof import('@/src/models/tarefas/responsaveis')>();
  return {
    ...real,
    acessoDaTarefa: vi.fn(),
    listar: vi.fn(async () => []),
    definir: vi.fn(async () => []),
  };
});
vi.mock('@/src/models/notificacoes/notificacoes', () => ({ criarAviso: vi.fn(async () => {}) }));

import * as model from '@/src/models/tarefas/responsaveis';
import * as notificacoes from '@/src/models/notificacoes/notificacoes';
import { listarResponsaveis, definirResponsaveis } from './responsaveis';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const put = (corpo: unknown) => new Request('http://x', { method: 'PUT', body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  usuario.current = { id: 'dono', email: 'dono@x', user_metadata: { full_name: 'Dono' } };
  vi.mocked(model.acessoDaTarefa).mockResolvedValue({ titulo: 'T', principal: B, ehDonoDoProjeto: true });
});

describe('listar', () => {
  it('recusa sem login', async () => {
    usuario.current = null;
    expect((await listarResponsaveis('1')).status).toBe(401);
  });
  it('404 quando não enxerga a tarefa', async () => {
    vi.mocked(model.acessoDaTarefa).mockResolvedValueOnce(null);
    expect((await listarResponsaveis('1')).status).toBe(404);
  });
  it('devolve a lista', async () => {
    vi.mocked(model.listar).mockResolvedValueOnce([{ usuario_id: A, nome: 'Ana' }]);
    const resp = await listarResponsaveis('1');
    expect(await resp.json()).toEqual([{ usuario_id: A, nome: 'Ana' }]);
  });
});

describe('definir', () => {
  it('só o dono do projeto pode mudar', async () => {
    vi.mocked(model.acessoDaTarefa).mockResolvedValueOnce({ titulo: 'T', principal: null, ehDonoDoProjeto: false });
    expect((await definirResponsaveis(put({ usuarioIds: [A] }), '1')).status).toBe(403);
    expect(model.definir).not.toHaveBeenCalled();
  });
  it('recusa lista inválida', async () => {
    expect((await definirResponsaveis(put({ usuarioIds: ['x'] }), '1')).status).toBe(400);
  });
  it('não duplica o responsável principal', async () => {
    await definirResponsaveis(put({ usuarioIds: [A, B] }), '1');
    expect(model.definir).toHaveBeenCalledWith(expect.anything(), 1, [A]);
  });
  it('avisa quem entrou, menos quem fez a mudança', async () => {
    vi.mocked(model.definir).mockResolvedValueOnce([A, 'dono']);
    await definirResponsaveis(put({ usuarioIds: [A] }), '1');
    expect(notificacoes.criarAviso).toHaveBeenCalledTimes(1);
    expect(notificacoes.criarAviso).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ userId: A, taskId: 1, type: 'assigned', senderName: 'Dono' }));
  });
  it('aviso que falha não derruba a gravação', async () => {
    vi.mocked(model.definir).mockResolvedValueOnce([A]);
    vi.mocked(notificacoes.criarAviso).mockRejectedValueOnce(new Error('x'));
    expect((await definirResponsaveis(put({ usuarioIds: [A] }), '1')).status).toBe(200);
  });
});
