import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

vi.mock('@/src/models/tarefas/consultas', async (original) => {
  const real = await original<typeof import('@/src/models/tarefas/consultas')>();
  return {
    ...real,
    listar: vi.fn(async () => [{ id: 1 }]),
    buscar: vi.fn(async () => ({ id: 1 })),
    aguardando: vi.fn(async () => [{ id: 2 }]),
  };
});

vi.mock('@/src/models/tarefas/escrita', async (original) => {
  const real = await original<typeof import('@/src/models/tarefas/escrita')>();
  return {
    ...real,
    criar: vi.fn(async () => ({ id: 3 })),
    atualizar: vi.fn(async () => {}),
    concluir: vi.fn(async () => {}),
    excluir: vi.fn(async () => {}),
    adiar: vi.fn(async () => {}),
    delegar: vi.fn(async () => {}),
    repetir: vi.fn(async () => {}),
  };
});

vi.mock('@/src/models/tarefas/mover', () => ({
  paraGrupo: vi.fn(async () => {}),
  paraProjeto: vi.fn(async () => {}),
  reordenar: vi.fn(async () => {}),
  vincularAoGrupo: vi.fn(async () => {}),
  desvincularDoGrupo: vi.fn(async () => {}),
  removerDoGrupo: vi.fn(async () => {}),
  gruposVinculados: vi.fn(async () => [3]),
}));

import * as consultas from '@/src/models/tarefas/consultas';
import * as escrita from '@/src/models/tarefas/escrita';
import * as mover from '@/src/models/tarefas/mover';
import { ErroValidacao } from '@/src/lib/erros';
import {
  listarTarefas, buscarTarefa, listarAguardando, criarTarefa, atualizarTarefa, excluirTarefa,
  concluirTarefa, adiarTarefa, delegarTarefa, repetirTarefa, moverTarefa, reordenarTarefa,
  listarGruposDaTarefa, vincularGrupo, desvincularGrupo,
} from './tarefas';

const HOJE = '2026-10-27';
const req = (dados: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(dados) });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.clearAllMocks();
});

describe('login e validação', () => {
  it('sem login nada passa', async () => {
    usuario.current = null;
    expect((await listarTarefas(new Request(`http://x/api?hoje=${HOJE}`))).status).toBe(401);
    expect((await excluirTarefa('1')).status).toBe(401);
    expect(escrita.excluir).not.toHaveBeenCalled();
  });

  it('listar exige a data de hoje (fuso do usuário)', async () => {
    expect((await listarTarefas(new Request('http://x/api'))).status).toBe(400);
    expect(consultas.listar).not.toHaveBeenCalled();
  });
});

describe('leitura', () => {
  it('listar repassa os filtros', async () => {
    const resp = await listarTarefas(new Request(`http://x/api?hoje=${HOJE}&projetoId=5&pastaId=2&concluidas=1`));
    expect(await resp.json()).toEqual([{ id: 1 }]);
    expect(consultas.listar).toHaveBeenCalledWith(expect.anything(), 'u1', {
      hoje: HOJE, projetoId: 5, pastaId: 2, concluidas: true, soHoje: false,
    });
  });

  it('buscar devolve 404 quando não acha', async () => {
    expect((await buscarTarefa(new Request(`http://x/api?hoje=${HOJE}`), '1')).status).toBe(200);
    vi.mocked(consultas.buscar).mockResolvedValueOnce(null);
    expect((await buscarTarefa(new Request(`http://x/api?hoje=${HOJE}`), '1')).status).toBe(404);
  });

  it('aguardando', async () => {
    expect(await (await listarAguardando()).json()).toEqual([{ id: 2 }]);
  });
});

describe('escrita', () => {
  it('cria validada', async () => {
    expect((await criarTarefa(req({ title: 'X', projectId: 5 }))).status).toBe(201);
    expect(escrita.criar).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ title: 'X', projectId: 5 }));
    expect((await criarTarefa(req({ title: ' ' }))).status).toBe(400);
  });

  it('atualiza só campos permitidos', async () => {
    expect((await atualizarTarefa(req({ title: 'Y', user_id: 'hack' }), '7')).status).toBe(204);
    expect(escrita.atualizar).toHaveBeenCalledWith(expect.anything(), 7, { title: 'Y' });
  });

  it('sem permissão para excluir vira 400 com a mensagem', async () => {
    vi.mocked(escrita.excluir).mockRejectedValueOnce(new ErroValidacao('Apenas o criador ou membros do projeto podem excluir esta tarefa'));
    const resp = await excluirTarefa('7');
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toMatch(/Apenas o criador/);
  });

  it('concluir exige booleano', async () => {
    expect((await concluirTarefa(req({ concluida: true }), '7')).status).toBe(204);
    expect(escrita.concluir).toHaveBeenCalledWith(expect.anything(), 7, true);
    expect((await concluirTarefa(req({ concluida: 'sim' }), '7')).status).toBe(400);
  });

  it('adiar com horizonte e data; null volta a tarefa', async () => {
    expect((await adiarTarefa(req({ horizonte: 'week', planDate: '2026-11-02' }), '7')).status).toBe(204);
    expect(escrita.adiar).toHaveBeenCalledWith(expect.anything(), 7, 'week', '2026-11-02');
    await adiarTarefa(req({ horizonte: null }), '7');
    expect(escrita.adiar).toHaveBeenLastCalledWith(expect.anything(), 7, null, null);
    expect((await adiarTarefa(req({ horizonte: 'week', planDate: 'amanhã' }), '7')).status).toBe(400);
  });

  it('delegar e repetir', async () => {
    expect((await delegarTarefa(req({ responsavelId: null }), '7')).status).toBe(204);
    expect(escrita.delegar).toHaveBeenCalledWith(expect.anything(), 7, null);
    expect((await repetirTarefa(req({ freq: 'daily' }), '7')).status).toBe(204);
    expect(escrita.repetir).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({ freq: 'daily' }));
  });
});

describe('mover', () => {
  it('para grupo (ou caixa de entrada) e para projeto', async () => {
    expect((await moverTarefa(req({ destino: 'grupo', grupoId: null }), '7')).status).toBe(204);
    expect(mover.paraGrupo).toHaveBeenCalledWith(expect.anything(), 7, null);
    await moverTarefa(req({ destino: 'projeto', projetoId: 5, pastaId: 2 }), '7');
    expect(mover.paraProjeto).toHaveBeenCalledWith(expect.anything(), 7, 5, 2);
    expect((await moverTarefa(req({ destino: 'lixo' }), '7')).status).toBe(400);
  });

  it('reordenar valida a posição', async () => {
    expect((await reordenarTarefa(req({ pastaId: 2, indice: 1, projetoId: 10 }), '7')).status).toBe(204);
    expect(mover.reordenar).toHaveBeenCalledWith(expect.anything(), 7, 2, 1, 10, null);
    expect((await reordenarTarefa(req({ indice: -1 }), '7')).status).toBe(400);
  });

  it('grupos: lista, vincula e desvincula (com e sem o campo direto)', async () => {
    expect(await (await listarGruposDaTarefa('7')).json()).toEqual([3]);
    expect((await vincularGrupo('7', '3')).status).toBe(204);
    expect(mover.vincularAoGrupo).toHaveBeenCalledWith(expect.anything(), 7, 3);
    await desvincularGrupo(new Request('http://x/api'), '7', '3');
    expect(mover.desvincularDoGrupo).toHaveBeenCalledWith(expect.anything(), 7, 3);
    await desvincularGrupo(new Request('http://x/api?direto=1'), '7', '3');
    expect(mover.removerDoGrupo).toHaveBeenCalledWith(expect.anything(), 7, 3);
  });
});
