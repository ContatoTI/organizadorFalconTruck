/**
 * Mover tarefas entre listas/blocos (grupos), projetos e pastas,
 * e os vínculos extra com grupos (task_view_groups).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ErroValidacao } from '@/src/lib/erros';

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/**
 * Move para um grupo (ou para a Caixa de Entrada, com null), saindo do
 * projeto. A tarefa volta para "a fazer": mudar de contexto reabre o item.
 */
export async function paraGrupo(db: SupabaseClient, tarefaId: number, grupoId: number | null): Promise<void> {
  const { error } = await db
    .from('todos')
    .update({
      view_group_id: grupoId,
      project_id: null,
      section_id: null,
      is_completed: false,
      status: 'A_FAZER',
    })
    .eq('id', tarefaId);
  falhou(error);
}

/** Move para um projeto (e pasta opcional), saindo do grupo. */
export async function paraProjeto(
  db: SupabaseClient,
  tarefaId: number,
  projetoId: number | null,
  pastaId: number | null = null,
): Promise<void> {
  const { error } = await db
    .from('todos')
    .update({ project_id: projetoId, view_group_id: null, section_id: pastaId })
    .eq('id', tarefaId);
  falhou(error);
}

/** Move várias tarefas de uma vez para uma pasta. */
export async function loteParaPasta(db: SupabaseClient, tarefaIds: number[], pastaId: number): Promise<void> {
  if (tarefaIds.length === 0) return;
  const { error } = await db.from('todos').update({ section_id: pastaId }).in('id', tarefaIds);
  falhou(error);
}

/**
 * Move para a pasta `pastaId` na posição `indice` e renumera as posições
 * das pastas de origem e destino, dentro do contexto (projeto ou grupo).
 */
export async function reordenar(
  db: SupabaseClient,
  tarefaId: number,
  pastaId: number | null,
  indice: number,
  projetoId: number | null,
  grupoId: number | null = null,
): Promise<void> {
  const { data: tarefa } = await db.from('todos').select('section_id').eq('id', tarefaId).maybeSingle();
  if (!tarefa) throw new ErroValidacao('Tarefa não encontrada');
  const pastaOrigem = (tarefa as { section_id: number | null }).section_id;

  const tarefasDaPasta = (pasta: number | null) => {
    let q = db.from('todos').select('id');
    if (projetoId) q = q.eq('project_id', projetoId);
    else if (grupoId) q = q.eq('view_group_id', grupoId);
    else q = q.is('project_id', null).is('view_group_id', null);
    return pasta === null ? q.is('section_id', null) : q.eq('section_id', pasta);
  };

  // Lista ordenada do destino, sem a tarefa movida, e insere no índice pedido.
  const { data: destino } = await tarefasDaPasta(pastaId)
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  const ids = (((destino as { id: number }[] | null) || []).map(t => t.id)).filter(id => id !== tarefaId);
  ids.splice(indice, 0, tarefaId);

  for (let i = 0; i < ids.length; i++) {
    const alteracao: Record<string, number | null> = { position: i };
    if (ids[i] === tarefaId) alteracao.section_id = pastaId;
    const { error } = await db.from('todos').update(alteracao).eq('id', ids[i]);
    falhou(error);
  }

  // Mudou de pasta: renumera a pasta de origem também.
  if (pastaOrigem !== pastaId) {
    const { data: origem } = await tarefasDaPasta(pastaOrigem)
      .order('position', { ascending: true })
      .order('id', { ascending: true });
    const restantes = ((origem as { id: number }[] | null) || []).map(t => t.id);
    for (let i = 0; i < restantes.length; i++) {
      const { error } = await db.from('todos').update({ position: i }).eq('id', restantes[i]);
      falhou(error);
    }
  }
}

// ── Vínculos com grupos (task_view_groups) ──────────────────────────────────

/**
 * Vincula a um grupo SEM tirar do projeto: a tarefa aparece no bloco/lista
 * e continua no projeto de origem. Vincular de novo não duplica.
 */
export async function vincularAoGrupo(db: SupabaseClient, tarefaId: number, grupoId: number): Promise<void> {
  const { data: existente } = await db
    .from('task_view_groups')
    .select('id')
    .eq('task_id', tarefaId)
    .eq('view_group_id', grupoId)
    .maybeSingle();
  if (existente) return;

  const { error } = await db.from('task_view_groups').insert({ task_id: tarefaId, view_group_id: grupoId });
  falhou(error);
}

/** Desfaz só o vínculo extra com o grupo. */
export async function desvincularDoGrupo(db: SupabaseClient, tarefaId: number, grupoId: number): Promise<void> {
  const { error } = await db
    .from('task_view_groups')
    .delete()
    .eq('task_id', tarefaId)
    .eq('view_group_id', grupoId);
  falhou(error);
}

/**
 * Tira a tarefa do grupo por completo: desfaz tanto o campo direto
 * (view_group_id) quanto o vínculo extra — sem tirar do projeto.
 */
export async function removerDoGrupo(db: SupabaseClient, tarefaId: number, grupoId: number): Promise<void> {
  const { data: tarefa } = await db.from('todos').select('view_group_id').eq('id', tarefaId).maybeSingle();
  if (tarefa && (tarefa as { view_group_id: number | null }).view_group_id === grupoId) {
    const { error } = await db.from('todos').update({ view_group_id: null }).eq('id', tarefaId);
    falhou(error);
  }
  await desvincularDoGrupo(db, tarefaId, grupoId);
}

/** Ids dos grupos vinculados à tarefa. */
export async function gruposVinculados(db: SupabaseClient, tarefaId: number): Promise<number[]> {
  const { data, error } = await db.from('task_view_groups').select('view_group_id').eq('task_id', tarefaId);
  falhou(error);
  return ((data as { view_group_id: number }[] | null) || []).map(v => v.view_group_id);
}
