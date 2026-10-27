import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = {
  exchangeCodeForSession: vi.fn(async () => ({ error: null as unknown })),
  verifyOtp: vi.fn(async () => ({ error: null as unknown })),
};
vi.mock('@/src/lib/supabase/Server', () => ({ createClient: async () => ({ auth }) }));

import { pousoDoLink } from './callback';

const destino = async (url: string) => (await pousoDoLink(new Request(url))).headers.get('location');

beforeEach(() => vi.clearAllMocks());

describe('pousoDoLink', () => {
  it('troca o código e vai para o destino', async () => {
    expect(await destino('http://x.com/auth/callback?code=abc&next=/auth/reset-password'))
      .toBe('http://x.com/auth/reset-password');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('confirma token do e-mail', async () => {
    expect(await destino('http://x.com/auth/callback?token_hash=t&type=signup')).toBe('http://x.com/');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 't' });
  });

  it('link inválido volta para o login', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('expirado') });
    expect(await destino('http://x.com/auth/callback?code=velho')).toBe('http://x.com/login?error=link-invalido');
    expect(await destino('http://x.com/auth/callback')).toBe('http://x.com/login?error=link-invalido');
  });

  it('não manda para outro site', async () => {
    expect(await destino('http://x.com/auth/callback?code=abc&next=//site-ruim.com')).toBe('http://x.com/');
  });
});
