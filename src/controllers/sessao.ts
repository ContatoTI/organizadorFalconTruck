import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/src/lib/supabase/Server';
import { ErroValidacao } from '@/src/lib/erros';

// Base comum dos controllers: sessão do usuário e respostas padronizadas.

export type Sessao = { db: SupabaseClient; usuario: User };

export function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status });
}

/** Cliente do banco com a sessão do usuário (a RLS vale) ou 401. */
export async function exigirLogin(): Promise<Sessao | Response> {
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return erro(401, 'Faça login novamente.');
  return { db, usuario: user };
}

export { ErroValidacao };

/** Executa a ação; erro de validação vira 400, o resto vira 500 com mensagem clara. */
export async function tratar(acao: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErroValidacao) return erro(400, e.message);
    console.error(`[${acao}]`, e);
    return erro(500, `Não foi possível ${acao}.`);
  }
}

/** Lê o corpo JSON; corpo inválido vira ErroValidacao. */
export async function lerJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ErroValidacao('Dados inválidos.');
  }
}

export function idNumerico(texto: string): number {
  const id = Number(texto);
  if (!Number.isInteger(id) || id <= 0) throw new ErroValidacao('Identificador inválido.');
  return id;
}
