import { describe, it, expect, vi, beforeEach } from 'vitest';
import { perfilAPI } from './clientePerfis';

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async () => new Response(JSON.stringify([{ id: 'p1' }])));
  vi.stubGlobal('fetch', fetchFalso);
});

describe('perfilAPI (tela)', () => {
  it('monta o filtro na URL', async () => {
    expect(await perfilAPI.list({ excluirEu: true, limite: 50 })).toEqual([{ id: 'p1' }]);
    expect(fetchFalso.mock.calls[0][0]).toBe('/api/perfis?excluirEu=1&limite=50');
    await perfilAPI.list({ ids: ['a', 'b'] });
    expect(fetchFalso.mock.calls[1][0]).toBe('/api/perfis?ids=a%2Cb');
  });

  it('ids vazios não chamam o servidor; erro vira vazio', async () => {
    expect(await perfilAPI.list({ ids: [] })).toEqual([]);
    expect(fetchFalso).not.toHaveBeenCalled();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchFalso.mockImplementation(async () => new Response('{"erro":"x"}', { status: 500 }));
    expect(await perfilAPI.list()).toEqual([]);
  });
});
