/**
 * Responsáveis extras da tarefa ("Também responsáveis").
 * O principal continua em todos.assignee_id. Os extras são as pessoas com quem
 * a tarefa está compartilhada (task_shares): o banco já dá a elas ver e editar
 * a tarefa e enxergar o projeto — sem tabela nova.
 * Quem pode mexer por aqui: só o dono do projeto (conferido no controller).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ErroValidacao } from '@/src/lib/erros';

export interface ResponsavelExtra {
  usuario_id: string;
  nome: string;
}

/** Máximo de pessoas por tarefa, contando o responsável principal. */
export const LIMITE_RESPONSAVEIS = 3;

/** Quantos extras cabem, dado se já existe principal. */
export function vagasDeExtras(temPrincipal: boolean): number {
  return LIMITE_RESPONSAVEIS - (temPrincipal ? 1 : 0);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lista de ids válida, sem repetidos. */
export function validarIds(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) throw new ErroValidacao('Lista de responsáveis inválida.');
  if (entrada.some(id => typeof id !== 'string' || !UUID.test(id))) {
    throw new ErroValidacao('Responsável inválido.');
  }
  const unicos = [...new Set(entrada as string[])];
  if (unicos.length > LIMITE_RESPONSAVEIS) {
    throw new ErroValidacao(`No máximo ${LIMITE_RESPONSAVEIS} responsáveis por tarefa.`);
  }
  return unicos;
}

/** O que entra e o que sai para a lista atual virar a nova. */
export function diferenca(atuais: string[], novos: string[]): { entram: string[]; saem: string[] } {
  const a = new Set(atuais);
  const n = new Set(novos);
  return {
    entram: novos.filter(id => !a.has(id)),
    saem: atuais.filter(id => !n.has(id)),
  };
}

/** Projeto da tarefa e se o usuário é o dono dele (null = tarefa não visível). */
export async function acessoDaTarefa(
  db: SupabaseClient, tarefaId: number, usuarioId: string,
): Promise<{ titulo: string; principal: string | null; ehDonoDoProjeto: boolean } | null> {
  const { data, error } = await db.from('todos').select('title, assignee_id, project_id').eq('id', tarefaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const t = data as { title: string; assignee_id: string | null; project_id: number | null };

  let ehDonoDoProjeto = false;
  if (t.project_id) {
    const { data: projeto } = await db.from('projects').select('owner_id').eq('id', t.project_id).maybeSingle();
    ehDonoDoProjeto = (projeto as { owner_id: string } | null)?.owner_id === usuarioId;
  }
  return { titulo: t.title, principal: t.assignee_id, ehDonoDoProjeto };
}

const TABELA = 'task_shares';

async function idsAtuais(db: SupabaseClient, tarefaId: number): Promise<string[]> {
  const { data, error } = await db.from(TABELA).select('user_id').eq('task_id', tarefaId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data || []) as { user_id: string }[]).map(r => r.user_id);
}

export async function listar(db: SupabaseClient, tarefaId: number): Promise<ResponsavelExtra[]> {
  const ids = await idsAtuais(db, tarefaId);
  if (ids.length === 0) return [];

  const { data: perfis } = await db.from('profiles').select('id, full_name, email').in('id', ids);
  const nomes = new Map(((perfis || []) as { id: string; full_name: string | null; email: string | null }[])
    .map(p => [p.id, p.full_name || p.email || 'Usuário']));
  return ids.map(id => ({ usuario_id: id, nome: nomes.get(id) || 'Usuário' }));
}

/** Troca a lista inteira. Devolve quem entrou (para avisar). */
export async function definir(db: SupabaseClient, tarefaId: number, novos: string[]): Promise<string[]> {
  const { entram, saem } = diferenca(await idsAtuais(db, tarefaId), novos);

  if (saem.length > 0) {
    const { error } = await db.from(TABELA).delete().eq('task_id', tarefaId).in('user_id', saem);
    if (error) throw new Error(error.message);
  }
  if (entram.length > 0) {
    const { error } = await db.from(TABELA).insert(entram.map(user_id => ({ task_id: tarefaId, user_id })));
    if (error) throw new Error(error.message);
  }
  return entram;
}
