import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareAPI } from './clienteCompartilhamentos';

const UID = '11111111-1111-1111-1111-111111111111';
const resposta = (corpo: unknown, status = 200) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status });

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async () => resposta(null, 204));
  vi.stubGlobal('fetch', fetchFalso);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('shareAPI (tela)', () => {
  it('compartilha e remove pasta e tarefa nas rotas certas', async () => {
    expect(await shareAPI.shareSection(3, UID)).toEqual({ success: true });
    expect(fetchFalso).toHaveBeenLastCalledWith(`/api/compartilhamentos/pasta/3/usuarios/${UID}`, { method: 'PUT' });
    await shareAPI.unshareTask(9, UID);
    expect(fetchFalso).toHaveBeenLastCalledWith(`/api/compartilhamentos/tarefa/9/usuarios/${UID}`, { method: 'DELETE' });
  });

  it('responsável padrão manda o usuário (ou null)', async () => {
    await shareAPI.setSectionDefaultAssignee(3, null);
    expect(fetchFalso.mock.lastCall?.[1]).toMatchObject({ method: 'PATCH', body: '{"usuarioId":null}' });
  });

  it('erros: listas viram vazio e resumo vira listas vazias', async () => {
    fetchFalso.mockImplementation(async () => resposta({ erro: 'x' }, 500));
    expect(await shareAPI.getTaskShares(1)).toEqual([]);
    expect(await shareAPI.getSectionsSummary()).toEqual({ queCompartilhei: [], comigo: [] });
    expect(await shareAPI.shareTask(1, UID)).toEqual({ success: false, error: 'x' });
  });
});
