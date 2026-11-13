import { describe, it, expect, vi, beforeEach } from 'vitest';

const on = vi.fn();
const subscribe = vi.fn();
const removeChannel = vi.fn();
const canal = { on, subscribe };
const channel = vi.fn(() => canal);

vi.mock('@/src/lib/supabase/Client', () => ({
  createClient: () => ({ channel, removeChannel }),
}));

import { ouvirMudancas } from './clienteRealtime';

describe('ouvirMudancas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    on.mockReturnValue(canal);
  });

  it('assina cada tabela, com e sem filtro', () => {
    ouvirMudancas('teste', [{ tabela: 'todos', filtro: 'user_id=eq.1' }, { tabela: 'outra' }], () => {});

    expect(channel).toHaveBeenCalledWith('teste');
    expect(on).toHaveBeenNthCalledWith(1, 'postgres_changes',
      { event: '*', schema: 'public', table: 'todos', filter: 'user_id=eq.1' }, expect.any(Function));
    expect(on).toHaveBeenNthCalledWith(2, 'postgres_changes',
      { event: '*', schema: 'public', table: 'outra' }, expect.any(Function));
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it('chama o callback quando algo muda', () => {
    const aoMudar = vi.fn();
    ouvirMudancas('teste', [{ tabela: 'todos' }], aoMudar);
    (on.mock.calls[0][2] as () => void)();
    expect(aoMudar).toHaveBeenCalledOnce();
  });

  it('a função devolvida remove o canal', () => {
    const parar = ouvirMudancas('teste', [{ tabela: 'todos' }], () => {});
    parar();
    expect(removeChannel).toHaveBeenCalledWith(canal);
  });
});
