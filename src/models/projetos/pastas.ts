/**
 * Pastas (tabela sections) dentro dos projetos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Section } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export type AlteracaoPasta = Partial<Pick<Section, 'title' | 'color' | 'default_assignee_id'>>;

export interface NovaPasta {
  title: string;
  color: string | null;
  defaultAssigneeId: string | null;
}

const UUID = /^[0-9a-f-]{36}$/i;

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function responsavelOuNulo(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) throw new ErroValidacao('Responsável inválido.');
  return v;
}

export function validarNova(entrada: Record<string, unknown>): NovaPasta {
  const title = typeof entrada.title === 'string' ? entrada.title.trim() : '';
  if (!title) throw new ErroValidacao('Informe o nome da pasta.');
  return {
    title,
    color: typeof entrada.color === 'string' && entrada.color ? entrada.color : null,
    defaultAssigneeId: responsavelOuNulo(entrada.defaultAssigneeId),
  };
}

export function validarAlteracao(entrada: Record<string, unknown>): AlteracaoPasta {
  const saida: AlteracaoPasta = {};
  if ('title' in entrada) {
    const title = typeof entrada.title === 'string' ? entrada.title.trim() : '';
    if (!title) throw new ErroValidacao('Informe o nome da pasta.');
    saida.title = title;
  }
  if ('color' in entrada) saida.color = typeof entrada.color === 'string' ? entrada.color : null;
  if ('default_assignee_id' in entrada) saida.default_assignee_id = responsavelOuNulo(entrada.default_assignee_id);
  if (Object.keys(saida).length === 0) throw new ErroValidacao('Nada para alterar.');
  return saida;
}

export function validarIndice(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw new ErroValidacao('Posição inválida.');
  return v as number;
}

export async function listar(db: SupabaseClient, projetoId: number): Promise<Section[]> {
  const { data, error } = await db.from('sections').select('*').eq('project_id', projetoId).order('order');
  falhou(error);
  return (data || []) as Section[];
}

/** Cria no fim da lista de pastas do projeto. */
export async function criar(db: SupabaseClient, usuarioId: string, projetoId: number, nova: NovaPasta): Promise<Section> {
  const { data: ultima } = await db
    .from('sections')
    .select('order')
    .eq('project_id', projetoId)
    .order('order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const order = ((ultima as { order: number } | null)?.order ?? -1) + 1;

  const { data, error } = await db
    .from('sections')
    .insert({
      user_id: usuarioId,
      project_id: projetoId,
      title: nova.title,
      color: nova.color,
      order,
      default_assignee_id: nova.defaultAssigneeId,
    })
    .select()
    .single();
  falhou(error);
  return data as Section;
}

export async function atualizar(db: SupabaseClient, pastaId: number, alteracao: AlteracaoPasta): Promise<void> {
  const { error } = await db.from('sections').update(alteracao).eq('id', pastaId);
  falhou(error);
}

/**
 * Exclui a pasta. As tarefas dela voltam para a Caixa de Entrada (sem pasta):
 * o banco também solta, mas fica explícito.
 */
export async function excluir(db: SupabaseClient, pastaId: number): Promise<void> {
  const soltar = await db.from('todos').update({ section_id: null }).eq('section_id', pastaId);
  falhou(soltar.error);
  const { error } = await db.from('sections').delete().eq('id', pastaId);
  falhou(error);
}

/** Põe a pasta na posição `indice` e renumera só as que mudaram. */
export async function reordenar(db: SupabaseClient, pastaId: number, indice: number): Promise<void> {
  const { data: pasta } = await db.from('sections').select('project_id').eq('id', pastaId).maybeSingle();
  if (!pasta) throw new ErroValidacao('Pasta não encontrada.');

  const { data: todas, error } = await db
    .from('sections')
    .select('id, order')
    .eq('project_id', (pasta as { project_id: number }).project_id)
    .order('order', { ascending: true })
    .order('id', { ascending: true });
  falhou(error);
  const lista = (todas || []) as { id: number; order: number }[];

  const ids = lista.map(s => s.id).filter(id => id !== pastaId);
  ids.splice(indice, 0, pastaId);
  for (let i = 0; i < ids.length; i++) {
    if (lista.find(s => s.id === ids[i])?.order !== i) {
      const { error: erroOrdem } = await db.from('sections').update({ order: i }).eq('id', ids[i]);
      falhou(erroOrdem);
    }
  }
}

/** Move a pasta (e as tarefas dela) para o fim de outro projeto. */
export async function moverParaProjeto(db: SupabaseClient, pastaId: number, projetoDestinoId: number): Promise<void> {
  const { data: ultima } = await db
    .from('sections')
    .select('order')
    .eq('project_id', projetoDestinoId)
    .order('order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const order = ((ultima as { order: number } | null)?.order ?? -1) + 1;

  const { error } = await db.from('sections').update({ project_id: projetoDestinoId, order }).eq('id', pastaId);
  falhou(error);

  const tarefas = await db
    .from('todos')
    .update({ project_id: projetoDestinoId })
    .eq('section_id', pastaId)
    .neq('project_id', projetoDestinoId);
  falhou(tarefas.error);
}
