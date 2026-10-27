/**
 * Grupos (tabela view_groups): blocos de horário ("time") e listas ("list").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlockSchedule, Group } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export type TipoGrupo = Group['type'];
export type OrdemGrupos = 'created_at' | 'title';

/** O que o formulário de grupo preenche. */
export interface FormularioGrupo {
  title: string;
  type: TipoGrupo;
  icon: string;
  color: string;
  start_time: string;
  end_time: string;
  recurrence_type: string;
  recurrence_days: number[];
  schedules: BlockSchedule[];
  show_on_dashboard: boolean;
}

/** Colunas que a tela pode gravar. */
export type DadosGrupo = Partial<Pick<Group,
  'title' | 'type' | 'icon' | 'color' | 'start_time' | 'end_time' |
  'recurrence_type' | 'recurrence_days' | 'schedules' | 'show_on_dashboard'>>;

const CAMPOS = ['title', 'type', 'icon', 'color', 'start_time', 'end_time',
  'recurrence_type', 'recurrence_days', 'schedules', 'show_on_dashboard'] as const;
const TIPOS: readonly TipoGrupo[] = ['time', 'list'];

/**
 * Formulário → colunas. Campos de horário só valem para bloco ("time").
 * Horário por dia vazio grava null e o bloco volta a usar start_time/end_time —
 * assim dá para desfazer a personalização.
 */
export function montarDadosGrupo(form: FormularioGrupo): DadosGrupo {
  const bloco = form.type === 'time';
  return {
    title: form.title,
    type: form.type,
    icon: form.icon || null,
    color: form.color || null,
    start_time: bloco ? form.start_time : null,
    end_time: bloco ? form.end_time : null,
    recurrence_type: bloco ? form.recurrence_type : null,
    recurrence_days: bloco ? form.recurrence_days : null,
    schedules: bloco && form.schedules.length > 0 ? form.schedules : null,
    show_on_dashboard: form.show_on_dashboard,
  };
}

/** Só passa as colunas permitidas. Na criação, título e tipo são obrigatórios. */
export function validarDados(entrada: Record<string, unknown>, criacao = false): DadosGrupo {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS) {
    if (campo in entrada) saida[campo] = entrada[campo];
  }
  if (criacao || 'title' in saida) {
    if (typeof saida.title !== 'string' || !saida.title.trim()) throw new ErroValidacao('Informe o nome do grupo.');
  }
  if (criacao || 'type' in saida) {
    if (!TIPOS.includes(saida.type as TipoGrupo)) throw new ErroValidacao('Tipo de grupo inválido.');
  }
  if ('show_on_dashboard' in saida && typeof saida.show_on_dashboard !== 'boolean') {
    throw new ErroValidacao('Visibilidade inválida.');
  }
  if (Object.keys(saida).length === 0) throw new ErroValidacao('Nada para alterar.');
  return saida as DadosGrupo;
}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listar(db: SupabaseClient, usuarioId: string, ordem: OrdemGrupos = 'created_at'): Promise<Group[]> {
  const { data, error } = await db.from('view_groups').select('*').eq('user_id', usuarioId).order(ordem);
  falhou(error);
  return (data as Group[]) || [];
}

export async function criar(db: SupabaseClient, usuarioId: string, dados: DadosGrupo): Promise<Group> {
  const { data, error } = await db
    .from('view_groups')
    .insert({ ...dados, user_id: usuarioId })
    .select()
    .single();
  falhou(error);
  return data as Group;
}

export async function atualizar(db: SupabaseClient, usuarioId: string, id: number, dados: DadosGrupo): Promise<void> {
  const { error } = await db.from('view_groups').update(dados).eq('id', id).eq('user_id', usuarioId);
  falhou(error);
}

/**
 * Exclui o grupo. As tarefas voltam para a Caixa de Entrada: o banco já tem
 * ON DELETE SET NULL, mas limpamos explicitamente como defesa em profundidade.
 */
export async function excluir(db: SupabaseClient, usuarioId: string, id: number): Promise<void> {
  const limpar = await db.from('todos').update({ view_group_id: null }).eq('view_group_id', id);
  falhou(limpar.error);
  const { error } = await db.from('view_groups').delete().eq('id', id).eq('user_id', usuarioId);
  falhou(error);
}
