'use client';

/**
 * Login no navegador (Supabase Auth). Fica do lado da tela de propósito:
 * é o cliente do navegador que grava a sessão (cookies) de quem entrou.
 * Erro do Supabase vira exceção com a mensagem original.
 */

import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/Client';

const auth = () => createClient().auth;

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const clienteAuth = {
  async usuarioAtual(): Promise<User | null> {
    const { data: { user } } = await auth().getUser();
    return user;
  },

  async sessaoAtual(): Promise<Session | null> {
    const { data: { session } } = await auth().getSession();
    return session;
  },

  /** Avisa quando a sessão muda. Devolve a função para parar de ouvir. */
  aoMudarSessao(callback: (sessao: Session | null) => void): () => void {
    const { data: { subscription } } = auth().onAuthStateChange((_evento, sessao) => callback(sessao));
    return () => subscription.unsubscribe();
  },

  async entrarComSenha(email: string, senha: string): Promise<void> {
    falhou((await auth().signInWithPassword({ email, password: senha })).error);
  },

  async enviarLinkDeLogin(email: string): Promise<void> {
    falhou((await auth().signInWithOtp({
      email,
      options: { emailRedirectTo: process.env.NEXT_PUBLIC_APP_URL },
    })).error);
  },

  /**
   * window.location.origin, não uma env var: é o mesmo destino que o usuário
   * já está acessando, então funciona em qualquer ambiente. O link cai em
   * /auth/callback, que troca o código pela sessão no servidor e só então
   * abre /auth/reset-password.
   */
  async enviarRedefinicaoDeSenha(email: string): Promise<void> {
    falhou((await auth().resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })).error);
  },

  async cadastrar(email: string, senha: string): Promise<void> {
    falhou((await auth().signUp({ email, password: senha })).error);
  },

  /** Já logado: a sessão ativa basta para trocar a senha (não pede a antiga). */
  async trocarSenha(senha: string): Promise<void> {
    falhou((await auth().updateUser({ password: senha })).error);
  },

  async trocarNome(nome: string): Promise<void> {
    falhou((await auth().updateUser({ data: { full_name: nome } })).error);
  },
};
