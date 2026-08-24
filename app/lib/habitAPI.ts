'use client';

/**
 * Hábitos.
 *
 * Um hábito é uma linha; cada dia marcado é outra linha em habit_logs.
 * O UNIQUE(habit_id, day) do banco é o que deixa o clique no quadradinho ser
 * seguro: marcar duas vezes não duplica, e o desmarcar é um delete simples.
 */

import { createClient } from '@/app/lib/supabase/Client';
import type { Habit, HabitLog } from '@/types/index';
import { toISODate, startOfDay } from '@/app/lib/planning';

class HabitAPI {
  async list(userId: string): Promise<Habit[]> {
    const client = createClient();
    const { data, error } = await client
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[habitAPI.list] erro Supabase:', JSON.stringify(error, null, 2));
      return [];
    }
    return normalizeWeekdays((data as Habit[]) || []);
  }

  /** Marcações dos últimos `days` dias — é só o que a grade precisa mostrar. */
  async recentLogs(userId: string, days = 120): Promise<HabitLog[]> {
    const client = createClient();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await client
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('day', toISODate(since))
      .order('day', { ascending: false });

    if (error) {
      console.error('[habitAPI.recentLogs] erro Supabase:', JSON.stringify(error, null, 2));
      return [];
    }
    return (data as HabitLog[]) || [];
  }

  async create(
    userId: string,
    input: { title: string; color?: string | null; icon?: string | null; weekdays?: number[] | null; targetPerWeek?: number | null; goalId?: number | null }
  ): Promise<{ success: boolean; data?: Habit; error?: string }> {
    const title = input.title.trim();
    if (!title) return { success: false, error: 'Título não pode estar vazio' };

    try {
      const client = createClient();
      const { data: last } = await client
        .from('habits')
        .select('position')
        .eq('user_id', userId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const position = ((last as { position: number } | null)?.position ?? -1) + 1;

      const { data, error } = await client
        .from('habits')
        .insert({
          user_id: userId,
          title,
          color: input.color ?? '#6366f1',
          icon: input.icon ?? null,
          weekdays: input.weekdays && input.weekdays.length > 0 ? input.weekdays : null,
          target_per_week: input.targetPerWeek ?? null,
          goal_id: input.goalId ?? null,
          position,
        })
        .select()
        .single();

      if (error) {
        console.error('[habitAPI.create] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true, data: normalizeWeekdays([data as Habit])[0] };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async update(habitId: number, updates: Partial<Habit>): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client.from('habits').update(updates).eq('id', habitId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /** Arquiva em vez de apagar — o histórico do que você já fez fica de pé. */
  async archive(habitId: number): Promise<{ success: boolean; error?: string }> {
    return this.update(habitId, { archived_at: new Date().toISOString() });
  }

  async remove(habitId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client.from('habits').delete().eq('id', habitId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /** Marca o dia. Idempotente: marcar de novo não duplica nem dá erro. */
  async mark(userId: string, habitId: number, day: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client
        .from('habit_logs')
        .upsert({ user_id: userId, habit_id: habitId, day }, { onConflict: 'habit_id,day' });
      if (error) {
        console.error('[habitAPI.mark] erro Supabase:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async unmark(habitId: number, day: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = createClient();
      const { error } = await client.from('habit_logs').delete().eq('habit_id', habitId).eq('day', day);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

export const habitAPI = new HabitAPI();

/** jsonb pode voltar como string; deixa weekdays sempre como number[] ou null. */
function normalizeWeekdays(habits: Habit[]): Habit[] {
  return habits.map(h => {
    let weekdays = h.weekdays as unknown;
    if (typeof weekdays === 'string') {
      try { weekdays = JSON.parse(weekdays); } catch { weekdays = null; }
    }
    const list = Array.isArray(weekdays)
      ? weekdays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
      : null;
    return { ...h, weekdays: list && list.length > 0 ? list : null };
  });
}

// ── Regras de leitura ──────────────────────────────────────────────────────

/** O hábito vale neste dia da semana? Sem weekdays = vale todo dia. */
export function habitAppliesOn(habit: Habit, date: Date): boolean {
  if (!habit.weekdays || habit.weekdays.length === 0) return true;
  return habit.weekdays.includes(date.getDay());
}

/**
 * Sequência atual: quantos dias válidos seguidos foram marcados, contando de
 * hoje para trás. Dias em que o hábito não vale são pulados, não quebram —
 * senão um hábito de seg/qua/sex nunca passaria de 1.
 *
 * Hoje ainda não marcado não zera a sequência: o dia não acabou.
 */
export function currentStreak(habit: Habit, markedDays: Set<string>, now: Date = new Date()): number {
  let streak = 0;
  const cursor = startOfDay(now);

  // Se hoje vale e ainda não foi marcado, começa a contar de ontem.
  if (habitAppliesOn(habit, cursor) && !markedDays.has(toISODate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  // 400 dias de teto: é sequência, não arqueologia.
  for (let i = 0; i < 400; i++) {
    if (!habitAppliesOn(habit, cursor)) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (!markedDays.has(toISODate(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/** Quantas vezes o hábito foi cumprido nos últimos `days` dias em que valia. */
export function completionRate(
  habit: Habit,
  markedDays: Set<string>,
  days = 30,
  now: Date = new Date()
): { done: number; expected: number; percent: number } {
  let done = 0;
  let expected = 0;
  const cursor = startOfDay(now);

  for (let i = 0; i < days; i++) {
    if (habitAppliesOn(habit, cursor)) {
      expected++;
      if (markedDays.has(toISODate(cursor))) done++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return { done, expected, percent: expected === 0 ? 0 : Math.round((done / expected) * 100) };
}

/** Agrupa os logs por hábito em conjuntos de dias, prontos para consulta. */
export function indexLogs(logs: HabitLog[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const log of logs) {
    const set = map.get(log.habit_id);
    if (set) set.add(log.day);
    else map.set(log.habit_id, new Set([log.day]));
  }
  return map;
}
