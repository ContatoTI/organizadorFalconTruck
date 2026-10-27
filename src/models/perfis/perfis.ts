/**
 * Perfis (tabela profiles): nome e e-mail das pessoas cadastradas,
 * usados para atribuir, compartilhar e mostrar quem é quem.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export interface FiltroPerfis {
  /** Só estes ids. */
  ids?: string[];
  /** Deixa de fora este usuário (normalmente você). */
  excluirId?: string;
  limite?: number;
}

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 500;
const UUID = /^[0-9a-f-]{36}$/i;

/** "a,b,c" → ids validados; vazio → undefined. */
export function lerIds(texto: string | null): string[] | undefined {
  if (!texto) return undefined;
  const ids = texto.split(',');
  if (ids.length > LIMITE_MAXIMO || ids.some(id => !UUID.test(id))) throw new ErroValidacao('Lista de pessoas inválida.');
  return ids;
}

export function lerLimite(texto: string | null): number {
  if (!texto) return LIMITE_PADRAO;
  const limite = Number(texto);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) throw new ErroValidacao('Limite inválido.');
  return limite;
}

export async function listar(db: SupabaseClient, filtro: FiltroPerfis = {}): Promise<User[]> {
  if (filtro.ids && filtro.ids.length === 0) return [];
  let q = db.from('profiles').select('id, email, full_name, avatar_url');
  if (filtro.ids) q = q.in('id', filtro.ids);
  if (filtro.excluirId) q = q.neq('id', filtro.excluirId);
  const { data, error } = await q.limit(filtro.limite ?? LIMITE_PADRAO);
  if (error) throw new Error(error.message);
  return (data as User[]) || [];
}
