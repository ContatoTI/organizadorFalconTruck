/**
 * Lixeira: tarefas excluídas ficam marcadas com deleted_at até serem
 * restauradas ou removidas de vez. A RLS de todos restringe às tarefas
 * que o usuário pode ver/alterar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '@/types/index';

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listar(db: SupabaseClient): Promise<Task[]> {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  falhou(error);
  return (data as Task[]) || [];
}

/** Só age em tarefa que está na lixeira. Devolve false se não achou. */
export async function restaurar(db: SupabaseClient, tarefaId: number): Promise<boolean> {
  const { data, error } = await db
    .from('todos')
    .update({ deleted_at: null })
    .eq('id', tarefaId)
    .not('deleted_at', 'is', null)
    .select('id');
  falhou(error);
  return (data ?? []).length > 0;
}

/** Remove a linha do banco. Só age em tarefa que está na lixeira. */
export async function excluirDeVez(db: SupabaseClient, tarefaId: number): Promise<boolean> {
  const { data, error } = await db
    .from('todos')
    .delete()
    .eq('id', tarefaId)
    .not('deleted_at', 'is', null)
    .select('id');
  falhou(error);
  return (data ?? []).length > 0;
}
