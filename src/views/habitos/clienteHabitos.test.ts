import { describe, it, expect, vi, beforeEach } from 'vitest';
import { habitAPI } from './clienteHabitos';

const resposta = (corpo: unknown, status = 200) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status });

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async () => resposta(null, 204));
  vi.stubGlobal('fetch', fetchFalso);
});

describe('habitAPI (tela)', () => {
  it('lista; em erro devolve vazio', async () => {
    fetchFalso.mockResolvedValueOnce(resposta([{ id: 1 }]));
    expect(await habitAPI.list()).toEqual([{ id: 1 }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchFalso.mockResolvedValueOnce(resposta({ erro: 'x' }, 500));
    expect(await habitAPI.list()).toEqual([]);
  });

  it('marca e desmarca na rota do dia', async () => {
    expect(await habitAPI.mark(3, '2026-10-27')).toEqual({ success: true });
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/habitos/3/marcacoes/2026-10-27', { method: 'PUT' });
    await habitAPI.unmark(3, '2026-10-27');
    expect(fetchFalso).toHaveBeenLastCalledWith('/api/habitos/3/marcacoes/2026-10-27', { method: 'DELETE' });
  });

  it('erro vira success false com a mensagem', async () => {
    fetchFalso.mockResolvedValueOnce(resposta({ erro: 'Título não pode estar vazio' }, 400));
    expect(await habitAPI.create({ title: '' })).toEqual({ success: false, error: 'Título não pode estar vazio' });
  });

  it('cria e devolve o hábito', async () => {
    fetchFalso.mockResolvedValueOnce(resposta({ id: 9 }, 201));
    expect(await habitAPI.create({ title: 'Ler' })).toEqual({ success: true, data: { id: 9 } });
  });
});
