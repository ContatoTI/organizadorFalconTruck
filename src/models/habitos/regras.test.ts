import { describe, it, expect } from 'vitest';
import type { Habit, HabitLog } from '@/types/index';
import { normalizeWeekdays, habitAppliesOn, currentStreak, completionRate, indexLogs } from './regras';

const habito = (weekdays: number[] | null = null) => ({ id: 1, weekdays } as Habit);
// Quarta-feira, 21/10/2026.
const quarta = new Date(2026, 9, 21, 15, 0);
const dias = (...lista: string[]) => new Set(lista);

describe('normalizeWeekdays', () => {
  it('converte texto JSON e remove dias inválidos', () => {
    const [h] = normalizeWeekdays([{ weekdays: '[1,3,9]' as unknown } as Habit]);
    expect(h.weekdays).toEqual([1, 3]);
  });
  it('lista vazia ou inválida vira null', () => {
    expect(normalizeWeekdays([{ weekdays: [] } as unknown as Habit])[0].weekdays).toBeNull();
    expect(normalizeWeekdays([{ weekdays: 'xx' as unknown } as Habit])[0].weekdays).toBeNull();
  });
});

describe('habitAppliesOn', () => {
  it('sem dias definidos vale todo dia', () => {
    expect(habitAppliesOn(habito(), quarta)).toBe(true);
  });
  it('respeita os dias da semana', () => {
    expect(habitAppliesOn(habito([3]), quarta)).toBe(true);
    expect(habitAppliesOn(habito([1]), quarta)).toBe(false);
  });
});

describe('currentStreak', () => {
  it('conta dias seguidos até hoje', () => {
    expect(currentStreak(habito(), dias('2026-10-21', '2026-10-20', '2026-10-19'), quarta)).toBe(3);
  });
  it('hoje ainda não marcado não zera', () => {
    expect(currentStreak(habito(), dias('2026-10-20', '2026-10-19'), quarta)).toBe(2);
  });
  it('dias em que não vale são pulados', () => {
    // seg/qua: 21 (qua), 19 (seg), 14 (qua)
    expect(currentStreak(habito([1, 3]), dias('2026-10-21', '2026-10-19', '2026-10-14'), quarta)).toBe(3);
  });
  it('falha quebra a sequência', () => {
    expect(currentStreak(habito(), dias('2026-10-21', '2026-10-19'), quarta)).toBe(1);
  });
});

describe('completionRate', () => {
  it('calcula a porcentagem nos dias em que vale', () => {
    expect(completionRate(habito(), dias('2026-10-21', '2026-10-20'), 4, quarta))
      .toEqual({ done: 2, expected: 4, percent: 50 });
  });
  it('sem dias válidos dá zero', () => {
    expect(completionRate(habito([0]), dias(), 3, quarta)).toEqual({ done: 0, expected: 0, percent: 0 });
  });
});

describe('indexLogs', () => {
  it('agrupa os dias por hábito', () => {
    const logs = [
      { habit_id: 1, day: '2026-10-20' },
      { habit_id: 1, day: '2026-10-21' },
      { habit_id: 2, day: '2026-10-21' },
    ] as HabitLog[];
    const mapa = indexLogs(logs);
    expect(mapa.get(1)).toEqual(dias('2026-10-20', '2026-10-21'));
    expect(mapa.get(2)).toEqual(dias('2026-10-21'));
  });
});
