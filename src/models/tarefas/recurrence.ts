/**
 * Compromissos que se repetem.
 *
 * A tarefa continua sendo uma linha só. O que se repete é a exibição: quando o
 * calendário mostra março, ele pergunta a estas funções quais dias de março a
 * série toca. Nada é materializado no banco — editar "toda terça às 15h"
 * continua sendo editar uma linha, não 200.
 *
 * A âncora da série é o due_at da tarefa (ou due_date, quando não tem hora).
 */

import type { Task, RecurFreq } from '@/types/index';
import { toISODate, startOfDay } from '@/src/lib/planning';

/** Teto de segurança: nenhuma janela de exibição precisa de mais que isso. */
const MAX_OCCURRENCES = 400;

export interface Occurrence {
  /** A tarefa de origem. */
  task: Task;
  /** Data/hora desta ocorrência. */
  date: Date;
  /** YYYY-MM-DD da ocorrência na série original — a chave de todo_occurrences. */
  occurrenceISO: string;
  /** É a primeira data da série (a própria tarefa)? */
  isFirst: boolean;
  /** Já foi concluída nesta data? */
  isCompleted: boolean;
}

/** A tarefa se repete? */
export function isRecurring(task: Task): boolean {
  return !!task.recur_freq;
}

/** A âncora da série: de onde a repetição começa a contar. */
export function seriesStart(task: Task): Date | null {
  const iso = task.due_at ?? (task.due_date ? `${task.due_date}T09:00:00` : null);
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Copia a hora da âncora para outro dia. */
function withTimeOf(anchor: Date, day: Date): Date {
  const out = new Date(day);
  out.setHours(anchor.getHours(), anchor.getMinutes(), 0, 0);
  return out;
}

/**
 * Soma meses preservando o "dia do mês" da âncora sem escorregar.
 * Dia 31 + 1 mês em fevereiro vira 28/29, não 3 de março — que é o que o
 * `setMonth` do JavaScript faria e o que ninguém espera de "todo dia 31".
 */
function addMonthsClamped(anchor: Date, monthsToAdd: number): Date {
  const targetMonth = anchor.getMonth() + monthsToAdd;
  const year = anchor.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(anchor.getDate(), lastDay), anchor.getHours(), anchor.getMinutes(), 0, 0);
}

/** Os dias da semana em que a série cai. Vazio = usa o dia da âncora. */
function weekdaysOf(task: Task): number[] {
  const raw = task.recur_weekdays as unknown;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
}

/**
 * As datas em que a série cai dentro de [from, to].
 *
 * Devolve só o que está na janela, mas conta as ocorrências desde o início
 * para respeitar `recur_count` — senão "as 10 primeiras terças" ficaria
 * dependendo do mês que você está olhando.
 */
export function expandOccurrences(task: Task, from: Date, to: Date): Date[] {
  const anchor = seriesStart(task);
  if (!anchor) return [];

  const freq = task.recur_freq as RecurFreq | null;
  if (!freq) {
    // Sem regra: a própria data, se cair na janela.
    return anchor >= from && anchor <= to ? [anchor] : [];
  }

  const interval = Math.max(1, task.recur_interval ?? 1);
  const limit = task.recur_count && task.recur_count > 0 ? task.recur_count : null;
  const until = task.recur_until ? new Date(task.recur_until + 'T23:59:59') : null;

  const hardEnd = until && until < to ? until : to;
  const out: Date[] = [];
  let produced = 0;

  const consider = (date: Date): 'continue' | 'stop' => {
    if (until && date > until) return 'stop';
    produced++;
    if (limit && produced > limit) return 'stop';
    if (date >= from && date <= hardEnd) out.push(new Date(date));
    if (out.length >= MAX_OCCURRENCES) return 'stop';
    return 'continue';
  };

  if (freq === 'weekly') {
    const days = weekdaysOf(task);
    const targetDays = days.length > 0 ? days : [anchor.getDay()];

    // Domingo da semana da âncora — o passo semanal anda de semana em semana,
    // e dentro de cada semana visitamos os dias marcados em ordem.
    const weekCursor = startOfDay(anchor);
    weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay());

    for (let week = 0; week < MAX_OCCURRENCES; week++) {
      const weekStart = new Date(weekCursor);
      weekStart.setDate(weekStart.getDate() + week * interval * 7);
      if (weekStart > hardEnd) break;

      for (const day of targetDays) {
        const date = withTimeOf(anchor, new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + day));
        // A série nunca começa antes da própria âncora.
        if (date < anchor) continue;
        if (consider(date) === 'stop') return out;
      }
    }
    return out;
  }

  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    let date: Date;
    if (freq === 'daily') {
      date = new Date(anchor);
      date.setDate(date.getDate() + i * interval);
    } else if (freq === 'monthly') {
      date = addMonthsClamped(anchor, i * interval);
    } else {
      date = addMonthsClamped(anchor, i * interval * 12);
    }

    if (date > hardEnd) break;
    if (consider(date) === 'stop') break;
  }

  return out;
}

/**
 * As ocorrências prontas para render: já com o estado de conclusão de cada
 * data e sem as que foram puladas.
 */
export function occurrencesInRange(
  tasks: Task[],
  from: Date,
  to: Date,
  occurrenceState: Map<string, { completed: boolean; skipped: boolean }>
): Occurrence[] {
  const out: Occurrence[] = [];

  for (const task of tasks) {
    const anchor = seriesStart(task);
    if (!anchor) continue;

    for (const date of expandOccurrences(task, from, to)) {
      const occurrenceISO = toISODate(date);
      const state = occurrenceState.get(`${task.id}:${occurrenceISO}`);
      if (state?.skipped) continue;

      const isFirst = toISODate(anchor) === occurrenceISO;
      out.push({
        task,
        date,
        occurrenceISO,
        isFirst,
        // A primeira data usa o is_completed da própria tarefa, que é como as
        // tarefas sem repetição sempre funcionaram.
        isCompleted: state?.completed ?? (isFirst ? task.is_completed : false),
      });
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Chave usada no mapa de estado das ocorrências. */
export function occurrenceKey(taskId: number, iso: string): string {
  return `${taskId}:${iso}`;
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * "Toda terça" · "A cada 2 semanas, seg e qui" · "Todo dia 15" · "Todo ano"
 * Frase curta o suficiente para caber ao lado do título.
 */
export function describeRecurrence(task: Task): string | null {
  const freq = task.recur_freq as RecurFreq | null;
  if (!freq) return null;

  const interval = Math.max(1, task.recur_interval ?? 1);
  const anchor = seriesStart(task);
  let base: string;

  if (freq === 'daily') {
    base = interval === 1 ? 'Todo dia' : `A cada ${interval} dias`;
  } else if (freq === 'weekly') {
    const days = weekdaysOf(task);
    const list = days.length > 0 ? days : anchor ? [anchor.getDay()] : [];

    if (list.length === 0) {
      // Sem âncora e sem dias marcados não há o que descrever ainda.
      base = interval === 1 ? 'Toda semana' : `A cada ${interval} semanas`;
    } else if (list.length === 7) {
      base = interval === 1 ? 'Todo dia' : `Todo dia, a cada ${interval} semanas`;
    } else if (list.length === 1) {
      const name = WEEKDAY_NAMES[list[0]];
      const artigo = list[0] === 0 || list[0] === 6 ? 'Todo' : 'Toda';
      base = interval === 1 ? `${artigo} ${name}` : `A cada ${interval} semanas, ${name}`;
    } else {
      const names = list.map(d => WEEKDAY_SHORT[d]).join(', ');
      base = interval === 1 ? `Toda semana: ${names}` : `A cada ${interval} semanas: ${names}`;
    }
  } else if (freq === 'monthly') {
    const day = anchor ? anchor.getDate() : null;
    base = interval === 1
      ? day ? `Todo dia ${day}` : 'Todo mês'
      : `A cada ${interval} meses`;
  } else {
    base = interval === 1 ? 'Todo ano' : `A cada ${interval} anos`;
  }

  if (task.recur_until) {
    const until = new Date(task.recur_until + 'T00:00:00');
    base += `, até ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(until)}`;
  } else if (task.recur_count) {
    base += `, ${task.recur_count}x`;
  }

  return base;
}
