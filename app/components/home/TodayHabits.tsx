'use client';

import { cn } from '@/app/lib/utils';
import { habitAppliesOn, currentStreak } from '@/app/lib/habitAPI';
import type { Habit } from '@/types/index';
import { Repeat, Flame, ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

interface TodayHabitsProps {
  habits: Habit[];
  /** Dias marcados por hábito, já indexados. */
  marked: Map<number, Set<string>>;
  /** YYYY-MM-DD de hoje. */
  today: string;
  now: Date;
  onToggle: (habit: Habit, day: string) => void;
}

/**
 * Os hábitos de hoje, no Dashboard.
 *
 * Hábito não é tarefa: não entra na caixa de entrada, não se conclui uma vez
 * só. Mas precisa estar à vista todo dia, senão vira uma tela que ninguém
 * abre. Aqui ficam só os que valem hoje, prontos para um clique.
 */
export function TodayHabits({ habits, marked, today, now, onToggle }: TodayHabitsProps) {
  const dueToday = habits.filter(h => habitAppliesOn(h, now));
  if (dueToday.length === 0) return null;

  const done = dueToday.filter(h => marked.get(h.id)?.has(today)).length;

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Repeat className="w-4 h-4 text-primary" />
        <h2 className="text-[13px] font-semibold flex-1">Hábitos de hoje</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {done}/{dueToday.length}
        </span>
        <Link
          href="/habits"
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
        >
          ver <ArrowRight className="w-3 h-3" />
        </Link>
      </header>

      <div className="p-2 space-y-1">
        {dueToday.map(habit => {
          const isDone = marked.get(habit.id)?.has(today) ?? false;
          const streak = currentStreak(habit, marked.get(habit.id) ?? new Set(), now);
          const color = habit.color || '#6366f1';

          return (
            <button
              key={habit.id}
              type="button"
              onClick={() => onToggle(habit, today)}
              aria-label={isDone ? `Desmarcar ${habit.title}` : `Marcar ${habit.title}`}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                isDone ? 'bg-accent/60' : 'hover:bg-accent/40'
              )}
            >
              <span
                className={cn(
                  'shrink-0 w-5 h-5 rounded-md grid place-items-center border-2 transition-all text-[11px]',
                  isDone ? 'text-white' : 'border-dashed'
                )}
                style={isDone ? { backgroundColor: color, borderColor: color } : { borderColor: color }}
              >
                {habit.icon
                  ? habit.icon
                  : isDone
                    ? <Check className="w-3 h-3" strokeWidth={3} />
                    : null}
              </span>

              <span className={cn(
                'flex-1 min-w-0 truncate text-[12.5px]',
                isDone && 'line-through text-muted-foreground'
              )}>
                {habit.title}
              </span>

              {streak > 1 && (
                <span className="shrink-0 inline-flex items-center gap-0.5 text-[10.5px] font-medium text-orange-600 dark:text-orange-400">
                  <Flame className="w-2.5 h-2.5" />{streak}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
