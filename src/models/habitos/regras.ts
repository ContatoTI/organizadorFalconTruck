/**
 * Regras de leitura dos hábitos (puras, sem banco — usadas na tela e no servidor).
 *
 * Um hábito é uma linha; cada dia marcado é outra linha em habit_logs.
 */

import type { Habit, HabitLog } from '@/types/index';
import { toISODate, startOfDay } from '@/src/lib/planning';

/** jsonb pode voltar como string; deixa weekdays sempre como number[] ou null. */
export function normalizeWeekdays(habits: Habit[]): Habit[] {
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
