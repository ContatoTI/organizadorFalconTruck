import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chamarApi } from './chamarApi';

const resposta = (corpo: unknown, status = 200) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status });

beforeEach(() => vi.unstubAllGlobals());

describe('chamarApi', () => {
  it('envia JSON e devolve o corpo', async () => {
    const fetchFalso = vi.fn(async () => resposta({ id: 1 }));
    vi.stubGlobal('fetch', fetchFalso);
    await expect(chamarApi('/api/x', { method: 'POST', json: { a: 1 } })).resolves.toEqual({ id: 1 });
    expect(fetchFalso).toHaveBeenCalledWith('/api/x', expect.objectContaining({
      body: '{"a":1}', headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('204 devolve undefined', async () => {
    vi.stubGlobal('fetch', async () => resposta(null, 204));
    await expect(chamarApi('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('erro vira exceção com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', async () => resposta({ erro: 'Informe a descrição.' }, 400));
    await expect(chamarApi('/api/x')).rejects.toThrow('Informe a descrição.');
  });
});
