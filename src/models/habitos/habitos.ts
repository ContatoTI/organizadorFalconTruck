/**
 * Hábitos: acesso ao banco e validação.
 *
 * O UNIQUE(habit_id, day) do banco é o que deixa o clique no quadradinho ser
 * seguro: marcar duas vezes não duplica, e o desmarcar é um delete simples.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Habit, HabitLog } from '@/types/index';
import { toISODate } from '@/src/lib/planning';
import { ErroValidacao } from '@/src/lib/erros';
import { normalizeWeekdays } from './regras';

export interface NovoHabito {
  title: string;
  color?: string | null;
  icon?: string | null;
  weekdays?: number[] | null;
  targetPerWeek?: number | null;
  goalId?: number | null;
}

/** Colunas que a tela pode alterar. */
export type AlteracaoHabito = Partial<Pick<Habit, 'title' | 'color' | 'icon' | 'weekdays' | 'target_per_week' | 'goal_id' | 'archived_at'>>;

const CAMPOS_ALTERAVEIS = ['title', 'color', 'icon', 'weekdays', 'target_per_week', 'goal_id', 'archived_at'] as const;
const COR_PADRAO = '#6366f1';
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validarDia(dia: string): string {
  if (!DIA_ISO.test(dia)) throw new ErroValidacao('Dia inválido.');
  return dia;
}

const diasDaSemana = (weekdays: unknown): number[] | null => {
  if (!Array.isArray(weekdays)) return null;
  const lista = weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
  return lista.length > 0 ? lista : null;
};

const idOuNulo = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);

export function validarNovo(entrada: Partial<NovoHabito>): NovoHabito {
  const title = typeof entrada.title === 'string' ? entrada.title.trim() : '';
  if (!title) throw new ErroValidacao('Título não pode estar vazio');
  return {
    title,
    color: typeof entrada.color === 'string' && entrada.color ? entrada.color : COR_PADRAO,
    icon: typeof entrada.icon === 'string' && entrada.icon ? entrada.icon : null,
    weekdays: diasDaSemana(entrada.weekdays),
    targetPerWeek: idOuNulo(entrada.targetPerWeek),
    goalId: idOuNulo(entrada.goalId),
  };
}

/** Só passa as colunas permitidas; título vazio é recusado. */
export function validarAlteracao(entrada: Record<string, unknown>): AlteracaoHabito {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_ALTERAVEIS) {
    if (campo in entrada) saida[campo] = entrada[campo];
  }
  if ('title' in saida) {
    const title = typeof saida.title === 'string' ? saida.title.trim() : '';
    if (!title) throw new ErroValidacao('Título não pode estar vazio');
    saida.title = title;
  }
  if ('weekdays' in saida) saida.weekdays = diasDaSemana(saida.weekdays);
  if ('goal_id' in saida) saida.goal_id = idOuNulo(saida.goal_id);
  if ('target_per_week' in saida) saida.target_per_week = idOuNulo(saida.target_per_week);
  if (Object.keys(saida).length === 0) throw new ErroValidacao('Nada para alterar.');
  return saida as AlteracaoHabito;
}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listar(db: SupabaseClient, usuarioId: string): Promise<Habit[]> {
  const { data, error } = await db
    .from('habits')
    .select('*')
    .eq('user_id', usuarioId)
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  falhou(error);
  return normalizeWeekdays((data as Habit[]) || []);
}

/** Marcações dos últimos `dias` dias — é só o que a grade precisa mostrar. */
export async function marcacoesRecentes(db: SupabaseClient, usuarioId: string, dias: number, agora = new Date()): Promise<HabitLog[]> {
  const desde = new Date(agora);
  desde.setDate(desde.getDate() - dias);
  const { data, error } = await db
    .from('habit_logs')
    .select('*')
    .eq('user_id', usuarioId)
    .gte('day', toISODate(desde))
    .order('day', { ascending: false });
  falhou(error);
  return (data as HabitLog[]) || [];
}

export async function criar(db: SupabaseClient, usuarioId: string, novo: NovoHabito): Promise<Habit> {
  const { data: ultimo } = await db
    .from('habits')
    .select('position')
    .eq('user_id', usuarioId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((ultimo as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await db
    .from('habits')
    .insert({
      user_id: usuarioId,
      title: novo.title,
      color: novo.color ?? COR_PADRAO,
      icon: novo.icon ?? null,
      weekdays: novo.weekdays ?? null,
      target_per_week: novo.targetPerWeek ?? null,
      goal_id: novo.goalId ?? null,
      position,
    })
    .select()
    .single();
  falhou(error);
  return normalizeWeekdays([data as Habit])[0];
}

export async function atualizar(db: SupabaseClient, usuarioId: string, id: number, alteracao: AlteracaoHabito): Promise<void> {
  const { error } = await db.from('habits').update(alteracao).eq('id', id).eq('user_id', usuarioId);
  falhou(error);
}

export async function excluir(db: SupabaseClient, usuarioId: string, id: number): Promise<void> {
  const { error } = await db.from('habits').delete().eq('id', id).eq('user_id', usuarioId);
  falhou(error);
}

/** Marca o dia. Idempotente: marcar de novo não duplica nem dá erro. */
export async function marcar(db: SupabaseClient, usuarioId: string, habitoId: number, dia: string): Promise<void> {
  const { error } = await db
    .from('habit_logs')
    .upsert({ user_id: usuarioId, habit_id: habitoId, day: dia }, { onConflict: 'habit_id,day', ignoreDuplicates: true });
  falhou(error);
}

export async function desmarcar(db: SupabaseClient, usuarioId: string, habitoId: number, dia: string): Promise<void> {
  const { error } = await db
    .from('habit_logs')
    .delete()
    .eq('habit_id', habitoId)
    .eq('day', dia)
    .eq('user_id', usuarioId);
  falhou(error);
}
