import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = {
  signInWithPassword: vi.fn(async () => ({ error: null as { message: string } | null })),
  signUp: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null as { message: string } | null })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
    cb('SIGNED_IN', { user: { id: 'u1' } });
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
};
vi.mock('@/src/lib/supabase/Client', () => ({ createClient: () => ({ auth }) }));

import { clienteAuth } from './clienteAuth';

beforeEach(() => vi.clearAllMocks());

describe('clienteAuth', () => {
  it('entrar com senha; erro do Supabase vira exceção', async () => {
    await clienteAuth.entrarComSenha('a@x.com', '123456');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@x.com', password: '123456' });
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    await expect(clienteAuth.entrarComSenha('a@x.com', 'x')).rejects.toThrow('Invalid login credentials');
  });

  it('trocar nome e senha usam updateUser', async () => {
    await clienteAuth.trocarNome('Ana');
    await clienteAuth.trocarSenha('novaSenha');
    expect(auth.updateUser.mock.calls).toEqual([[{ data: { full_name: 'Ana' } }], [{ password: 'novaSenha' }]]);
  });

  it('redefinição passa pelo callback do próprio site', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://x.com' } });
    await clienteAuth.enviarRedefinicaoDeSenha('a@x.com');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@x.com', {
      redirectTo: 'http://x.com/auth/callback?next=/auth/reset-password',
    });
    vi.unstubAllGlobals();
  });

  it('ouvir a sessão entrega a sessão e devolve como parar', () => {
    const recebido = vi.fn();
    const parar = clienteAuth.aoMudarSessao(recebido);
    expect(recebido).toHaveBeenCalledWith({ user: { id: 'u1' } });
    expect(typeof parar).toBe('function');
  });
});
