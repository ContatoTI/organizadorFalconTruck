'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/src/lib/utils';
import { toISODate, startOfDay } from '@/src/lib/planning';
import { expandOccurrences } from '@/src/models/tarefas/recurrence';
import type { Task } from '@/types/index';
import { CalendarDays, ArrowRight, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import Link from 'next/link';

const START_HOUR = 6;
const END_HOUR = 23;
/** Quantos dias a faixa mostra de uma vez. 14 cobre "esta e a próxima semana". */
const STRIP_DAYS = 14;

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Um dia da faixa: aceita tarefa solta e vira "aquele dia, sem hora". */
function DayCell({
  date, iso, isToday, isSelected, count, onSelect,
}: {
  date: Date;
  iso: string;
  isToday: boolean;
  isSelected: boolean;
  count: number;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${iso}`,
    data: { type: 'day', iso },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      title={new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)}
      className={cn(
        'relative shrink-0 w-[42px] py-1.5 rounded-lg border transition-all flex flex-col items-center gap-0.5',
        isOver
          ? 'border-primary bg-primary/15 ring-2 ring-primary/30 scale-105'
          : isSelected
            ? 'border-primary bg-primary/10'
            : 'border-transparent hover:bg-accent/60'
      )}
    >
      <span className={cn(
        'text-[9.5px] uppercase tracking-wide',
        isToday ? 'text-primary font-semibold' : 'text-muted-foreground'
      )}>
        {WEEKDAY_SHORT[date.getDay()]}
      </span>
      <span className={cn(
        'text-[13px] tabular-nums leading-none',
        isToday ? 'text-primary font-bold' : isSelected ? 'font-semibold' : 'text-foreground/80'
      )}>
        {date.getDate()}
      </span>
      <span className="h-[4px] flex items-center">
        {count > 0 && (
          <span
            className={cn('w-1 h-1 rounded-full', isSelected || isToday ? 'bg-primary' : 'bg-muted-foreground/40')}
          />
        )}
      </span>
    </button>
  );
}

/** Uma faixa de meia hora do dia escolhido. */
function Slot({
  iso, hour, minute, children,
}: {
  iso: string;
  hour: number;
  minute: 0 | 30;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${iso}:${hour}:${minute}`,
    data: { type: 'slot', iso, hour, minute },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative h-[26px] border-t transition-colors',
        minute === 0 ? 'border-border' : 'border-border/40 border-dashed',
        isOver && 'bg-primary/15 border-primary'
      )}
    >
      {isOver && (
        <span className="absolute -top-[7px] left-1 text-[10px] font-medium text-primary bg-card px-1 rounded z-10">
          {String(hour).padStart(2, '0')}:{minute === 0 ? '00' : '30'}
        </span>
      )}
      {children}
    </div>
  );
}

interface AgendaRailProps {
  /** Todas as tarefas visíveis — a faixa marca os dias que têm alguma coisa. */
  tasks: Task[];
  now: Date;
  /** Dia aberto na grade de horas. */
  selectedISO: string;
  onSelectDay: (iso: string) => void;
  /** Deslocamento da faixa, em semanas, a partir de hoje. */
  weekOffset: number;
  onWeekOffset: (offset: number) => void;
  onSelect: (task: Task) => void;
}

/**
 * A agenda da lateral do Dashboard.
 *
 * Duas camadas com propósitos diferentes:
 *   · a faixa de dias aceita "vai ser nesse dia, hora eu vejo depois" — é o
 *     jeito mais rápido de tirar algo da caixa de entrada sem se comprometer
 *     com um horário;
 *   · a grade de horas, do dia escolhido, aceita o compromisso real.
 */
export function AgendaRail({
  tasks, now, selectedISO, onSelectDay, weekOffset, onWeekOffset, onSelect,
}: AgendaRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  const todayISO = toISODate(startOfDay(now));
  const isTodaySelected = selectedISO === todayISO;

  // Os dias da faixa, a partir da semana em foco.
  const stripDays = useMemo(() => {
    const first = startOfDay(now);
    first.setDate(first.getDate() + weekOffset * 7);
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const d = new Date(first);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [now, weekOffset]);

  /**
   * Quantas tarefas caem em cada dia — alimenta o pontinho da faixa.
   * Séries entram em todos os dias que tocam dentro da faixa visível, senão
   * "toda terça" só marcaria a primeira terça.
   */
  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    if (stripDays.length === 0) return map;

    const from = stripDays[0];
    const to = new Date(stripDays[stripDays.length - 1]);
    to.setHours(23, 59, 59, 999);

    const bump = (iso: string) => map.set(iso, (map.get(iso) ?? 0) + 1);

    for (const t of tasks) {
      if (t.recur_freq) {
        for (const date of expandOccurrences(t, from, to)) bump(toISODate(date));
        continue;
      }
      const iso = t.due_at ? toISODate(new Date(t.due_at)) : t.due_date;
      if (iso) bump(iso);
    }
    return map;
  }, [tasks, stripDays]);

  /**
   * O que acontece no dia aberto, separado entre com e sem hora.
   * Cada item carrega a hora daquela ocorrência — numa série, a data da
   * tarefa e a data mostrada são coisas diferentes.
   */
  const { timed, allDay } = useMemo(() => {
    const timedList: Array<{ task: Task; at: Date }> = [];
    const allDayList: Task[] = [];

    const dayStart = new Date(selectedISO + 'T00:00:00');
    const dayEnd = new Date(selectedISO + 'T23:59:59');

    for (const t of tasks) {
      if (t.recur_freq) {
        for (const date of expandOccurrences(t, dayStart, dayEnd)) {
          if (t.due_at) timedList.push({ task: t, at: date });
          else allDayList.push(t);
        }
        continue;
      }
      if (t.due_at) {
        const at = new Date(t.due_at);
        if (toISODate(at) === selectedISO) timedList.push({ task: t, at });
      } else if (t.due_date === selectedISO) {
        allDayList.push(t);
      }
    }
    return { timed: timedList, allDay: allDayList };
  }, [tasks, selectedISO]);

  const byHalfHour = useMemo(() => {
    const map = new Map<string, Array<{ task: Task; at: Date }>>();
    for (const item of timed) {
      const key = `${item.at.getHours()}:${item.at.getMinutes() >= 30 ? 30 : 0}`;
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [timed]);

  // Abre na altura certa: a hora atual quando é hoje, o começo do dia se não.
  useEffect(() => {
    if (!scrollRef.current || scrolledFor.current === selectedISO) return;
    const hour = isTodaySelected ? now.getHours() - 1 : 7;
    scrollRef.current.scrollTop = Math.max(0, (hour - START_HOUR) * 52);
    scrolledFor.current = selectedISO;
  }, [selectedISO, isTodaySelected, now]);

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const nowTop = (now.getHours() - START_HOUR) * 52 + (now.getMinutes() / 60) * 52;
  const nowVisible = isTodaySelected && now.getHours() >= START_HOUR && now.getHours() <= END_HOUR;

  const selectedDate = new Date(selectedISO + 'T00:00:00');

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h2 className="text-[13px] font-semibold flex-1">Agenda</h2>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => onWeekOffset(weekOffset - 1)}
            aria-label="Semana anterior"
            className="h-6 w-6 grid place-items-center rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { onWeekOffset(0); onSelectDay(todayISO); }}
            className={cn(
              'h-6 px-1.5 rounded text-[10.5px] transition-colors',
              weekOffset === 0 ? 'text-muted-foreground' : 'text-primary hover:bg-accent'
            )}
          >
            hoje
          </button>
          <button
            type="button"
            onClick={() => onWeekOffset(weekOffset + 1)}
            aria-label="Próxima semana"
            className="h-6 w-6 grid place-items-center rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <Link
          href="/calendar"
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
        >
          abrir <ArrowRight className="w-3 h-3" />
        </Link>
      </header>

      {/* ── Faixa de dias: solte aqui para "nesse dia, sem hora" ────────── */}
      <div className="px-2 py-2 border-b border-border overflow-x-auto">
        <div className="flex gap-0.5">
          {stripDays.map(date => {
            const iso = toISODate(date);
            return (
              <DayCell
                key={iso}
                date={date}
                iso={iso}
                isToday={iso === todayISO}
                isSelected={iso === selectedISO}
                count={countByDay.get(iso) ?? 0}
                onSelect={() => onSelectDay(iso)}
              />
            );
          })}
        </div>
      </div>

      {/* ── Dia sem hora marcada ───────────────────────────────────────── */}
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground capitalize truncate flex-1">
          {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).format(selectedDate)}
        </span>
        {allDay.length > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {allDay.length} sem hora
          </span>
        )}
      </div>

      {allDay.length > 0 && (
        <div className="px-2 py-1.5 border-b border-border space-y-px max-h-[92px] overflow-y-auto">
          {allDay.map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelect(task)}
              className={cn(
                'w-full text-left text-[11.5px] leading-[22px] px-1.5 rounded truncate',
                'bg-muted text-foreground/80 hover:bg-accent transition-colors',
                task.is_completed && 'line-through opacity-50'
              )}
            >
              {task.recur_freq && <Repeat className="inline w-2.5 h-2.5 mr-1 -mt-px opacity-70" />}
              {task.title}
            </button>
          ))}
        </div>
      )}

      {/* ── Grade de horas do dia escolhido ────────────────────────────── */}
      <div ref={scrollRef} className="relative overflow-y-auto max-h-[340px]">
        {nowVisible && (
          <div
            className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
            style={{ top: nowTop }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-[42px] -translate-x-1/2" />
            <span className="flex-1 h-px bg-red-500" />
          </div>
        )}

        {hours.map(hour => (
          <div key={hour} className="flex">
            <div className="w-[46px] shrink-0 pt-[1px] pr-2 text-right">
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
            <div className="flex-1 min-w-0">
              {([0, 30] as const).map(minute => (
                <Slot key={minute} iso={selectedISO} hour={hour} minute={minute}>
                  <div className="flex flex-col gap-px px-1 pt-px">
                    {(byHalfHour.get(`${hour}:${minute}`) ?? []).map(({ task, at }) => (
                      <button
                        key={`${task.id}@${toISODate(at)}`}
                        type="button"
                        onClick={() => onSelect(task)}
                        className={cn(
                          'w-full text-left text-[11px] leading-[22px] px-1.5 rounded truncate',
                          'bg-primary/10 text-primary border-l-2 border-primary hover:bg-primary/20 transition-colors',
                          task.is_completed && 'line-through opacity-50'
                        )}
                      >
                        {task.recur_freq && <Repeat className="inline w-2.5 h-2.5 mr-1 -mt-px opacity-70" />}
                        {task.title}
                      </button>
                    ))}
                  </div>
                </Slot>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="px-3 py-2 text-[11px] text-muted-foreground/60 border-t border-border">
        Solte num <strong className="font-medium">dia</strong> para marcar sem hora, ou num horário para agendar.
      </p>
    </section>
  );
}
