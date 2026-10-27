/**
 * Objetivos (tabela goals): acesso ao banco e validação.
 *
 * Apagar um objetivo leva junto os filhos (ON DELETE CASCADE no banco),
 * mas as tarefas apenas se soltam (ON DELETE SET NULL) — ninguém quer
 * perder tarefa por arrumar a árvore.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Goal, Task } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export interface NovaMeta {
  title: string;
  parentId?: number | null;
  description?: string | null;
  targetDate?: string | null;
  color?: string | null;
}

/** Colunas que a tela pode alterar. */
export type AlteracaoMeta = Partial<Pick<Goal,
  'title' | 'description' | 'target_date' | 'is_completed' | 'parent_id' | 'color' | 'icon' | 'position'>>;

const CAMPOS_ALTERAVEIS = ['title', 'description', 'target_date', 'is_completed', 'parent_id', 'color', 'icon', 'position'] as const;
const COR_PADRAO = '#6366f1';
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IDS = 500;

const idOuNulo = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function dataOuNulo(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !DATA_ISO.test(v)) throw new ErroValidacao('Data inválida.');
  return v;
}

export function validarNova(entrada: Partial<NovaMeta>): NovaMeta {
  const title = typeof entrada.title === 'string' ? entrada.title.trim() : '';
  if (!title) throw new ErroValidacao('Título não pode estar vazio');
  return {
    title,
    parentId: idOuNulo(entrada.parentId),
    description: textoOuNulo(entrada.description),
    targetDate: dataOuNulo(entrada.targetDate),
    color: textoOuNulo(entrada.color) ?? COR_PADRAO,
  };
}

/** Só passa as colunas permitidas; título vazio é recusado. */
export function validarAlteracao(entrada: Record<string, unknown>, metaId: number): AlteracaoMeta {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_ALTERAVEIS) {
    if (campo in entrada) saida[campo] = entrada[campo];
  }
  if ('title' in saida) {
    const title = typeof saida.title === 'string' ? saida.title.trim() : '';
    if (!title) throw new ErroValidacao('Título não pode estar vazio');
    saida.title = title;
  }
  if ('is_completed' in saida) saida.is_completed = saida.is_completed === true;
  if ('target_date' in saida) saida.target_date = dataOuNulo(saida.target_date);
  if ('parent_id' in saida) {
    saida.parent_id = idOuNulo(saida.parent_id);
    if (saida.parent_id === metaId) throw new ErroValidacao('Um objetivo não pode ficar dentro dele mesmo.');
  }
  if (Object.keys(saida).length === 0) throw new ErroValidacao('Nada para alterar.');
  return saida as AlteracaoMeta;
}

/** "1,2,3" → [1,2,3]; vazio → []. */
export function lerIds(texto: string | null): number[] {
  if (!texto) return [];
  const ids = texto.split(',').map(Number);
  if (ids.length > MAX_IDS || ids.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new ErroValidacao('Lista de objetivos inválida.');
  }
  return ids;
}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listar(db: SupabaseClient, usuarioId: string): Promise<Goal[]> {
  const { data, error } = await db
    .from('goals')
    .select('*')
    .eq('user_id', usuarioId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  falhou(error);
  return (data as Goal[]) || [];
}

export async function criar(db: SupabaseClient, usuarioId: string, nova: NovaMeta): Promise<Goal> {
  // Posição no fim da lista de irmãos, para o novo item nascer embaixo.
  let q = db.from('goals').select('position').eq('user_id', usuarioId);
  q = nova.parentId ? q.eq('parent_id', nova.parentId) : q.is('parent_id', null);
  const { data: ultimo } = await q.order('position', { ascending: false }).limit(1).maybeSingle();
  const position = ((ultimo as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await db
    .from('goals')
    .insert({
      user_id: usuarioId,
      title: nova.title,
      parent_id: nova.parentId ?? null,
      description: nova.description ?? null,
      target_date: nova.targetDate ?? null,
      color: nova.color ?? COR_PADRAO,
      position,
      is_completed: false,
    })
    .select()
    .single();
  falhou(error);
  return data as Goal;
}

export async function atualizar(db: SupabaseClient, usuarioId: string, id: number, alteracao: AlteracaoMeta): Promise<void> {
  const { error } = await db
    .from('goals')
    .update({ ...alteracao, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', usuarioId);
  falhou(error);
}

export async function excluir(db: SupabaseClient, usuarioId: string, id: number): Promise<void> {
  const { error } = await db.from('goals').delete().eq('id', id).eq('user_id', usuarioId);
  falhou(error);
}

/** Tarefas ligadas a qualquer nó da árvore (a RLS de todos decide o que o usuário vê). */
export async function tarefasDasMetas(db: SupabaseClient, metaIds: number[]): Promise<Task[]> {
  if (metaIds.length === 0) return [];
  const { data, error } = await db
    .from('todos')
    .select('*')
    .in('goal_id', metaIds)
    .is('deleted_at', null)
    .order('position', { ascending: true });
  falhou(error);
  return (data as Task[]) || [];
}
