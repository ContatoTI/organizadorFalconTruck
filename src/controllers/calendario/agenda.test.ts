import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/calendario/agenda', async (original) => {
  const real = await original<typeof import('@/src/models/calendario/agenda')>();
  return {
    ...real,
    agendar: vi.fn(async () => {}),
    agendarDiaInteiro: vi.fn(async () => {}),
    ocorrencias: vi.fn(async () => [{ id: 1 }]),
    marcarOcorrencia: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/calendario/agenda';
import { agendarTarefa, agendarDiaInteiro, listarOcorrencias, marcarOcorrencia } from './agenda';

const req = (dados: unknown) => new Request('http://x', { method: 'PATCH', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('agenda', () => {
  it('sem login: 401', async () => {
    usuario.current = null;
    expect((await agendarTarefa(req({ dueAt: null }), '5')).status).toBe(401);
    expect(model.agendar).not.toHaveBeenCalled();
  });

  it('agenda com horário validado', async () => {
    const corpo = { dueAt: '2026-10-27T13:00:00.000Z', dueDate: '2026-10-27', durationMin: 30 };
    expect((await agendarTarefa(req(corpo), '5')).status).toBe(204);
    expect(model.agendar).toHaveBeenCalledWith(expect.anything(), 5, corpo);
  });

  it('horário inválido: 400', async () => {
    expect((await agendarTarefa(req({ dueAt: 'xx', dueDate: '2026-10-27' }), '5')).status).toBe(400);
  });

  it('dia inteiro', async () => {
    expect((await agendarDiaInteiro(req({ dueDate: '2026-10-28' }), '5')).status).toBe(204);
    expect(model.agendarDiaInteiro).toHaveBeenCalledWith(expect.anything(), 5, '2026-10-28');
    expect((await agendarDiaInteiro(req({ dueDate: null }), '5')).status).toBe(400);
  });

  it('ocorrências do usuário no período', async () => {
    const resp = await listarOcorrencias(new Request('http://x/api?de=2026-10-01&ate=2026-10-31'));
    expect(await resp.json()).toEqual([{ id: 1 }]);
    expect(model.ocorrencias).toHaveBeenCalledWith(expect.anything(), 'u1', '2026-10-01', '2026-10-31');
    expect((await listarOcorrencias(new Request('http://x/api?de=2026-10-01'))).status).toBe(400);
  });

  it('marca uma data da série', async () => {
    expect((await marcarOcorrencia(req({ completed: false }), '5', '2026-10-27')).status).toBe(204);
    expect(model.marcarOcorrencia).toHaveBeenCalledWith(expect.anything(), 'u1', 5, '2026-10-27', { completed: false });
  });
});
