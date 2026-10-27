/**
 * Adiamento por horizonte.
 *
 * A ideia: nem toda tarefa merece uma data. Algumas você só quer tirar da
 * frente — "isso é coisa do mês que vem", "vejo isso ano que vem". Escolher
 * uma granularidade em vez de uma data exata é mais rápido e mais honesto,
 * e a tarefa volta sozinha quando o horizonte chega.
 *
 * plan_date é sempre normalizada para a borda do horizonte, para que a
 * comparação "já chegou?" seja uma única comparação de datas.
 */

import type { Task, PlanHorizon } from '@/types/index';

export interface PlanBucket {
  key: string;
  horizon: PlanHorizon;
  /** Âncora normalizada, YYYY-MM-DD. */
  date: string;
  /** "Amanhã", "Semana que vem", "Setembro", "2027" */
  label: string;
  /** Texto curto para o chip de arrastar. */
  short: string;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Segunda-feira da semana de `d`. A semana começa na segunda por aqui. */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const shift = (out.getDay() + 6) % 7; // domingo(0) vira 6
  out.setDate(out.getDate() - shift);
  return out;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

/** Normaliza qualquer data para a borda do horizonte escolhido. */
export function anchorFor(horizon: PlanHorizon, date: Date): Date {
  switch (horizon) {
    case 'day': return startOfDay(date);
    case 'week': return startOfWeek(date);
    case 'month': return startOfMonth(date);
    case 'year': return startOfYear(date);
  }
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Os destinos de adiamento oferecidos no Dashboard.
 *
 * Todos apontam para o FUTURO, sem exceção. "Esta semana" e "este mês" seriam
 * armadilhas: como a tarefa volta quando `plan_date <= hoje`, um horizonte
 * ancorado no período corrente reapareceria no mesmo instante — o usuário
 * mandaria a tarefa embora e ela não sairia do lugar.
 *
 * A ordem é a da cabeça de quem está adiando: primeiro o curto prazo,
 * depois o "algum dia".
 */
export function planBuckets(now: Date = new Date()): PlanBucket[] {
  const buckets: PlanBucket[] = [];

  const add = (horizon: PlanHorizon, date: Date, label: string, short: string) => {
    const anchor = anchorFor(horizon, date);
    const iso = toISODate(anchor);

    // Perto de uma virada, horizontes diferentes caem no mesmo dia: em 20/12
    // "semana que vem" começa dia 21, igual a "amanhã"; e "janeiro" é o mesmo
    // 1º de janeiro do chip "2027". Dois chips que fazem a mesma coisa só
    // confundem, então o primeiro (mais específico) ganha.
    if (buckets.some(b => b.date === iso)) return;

    buckets.push({ key: `plan:${horizon}:${iso}`, horizon, date: iso, label, short });
  };

  // Amanhã
  add('day', new Date(now.getTime() + 86400000), 'Amanhã', 'Amanhã');

  // As duas próximas semanas
  const nextWeek = new Date(startOfWeek(now).getTime() + 7 * 86400000);
  const weekAfter = new Date(startOfWeek(now).getTime() + 14 * 86400000);
  add('week', nextWeek, 'Semana que vem', 'Próx. semana');
  add('week', weekAfter, `Semana de ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(weekAfter)}`, 'Em 2 sem.');

  // Os dois próximos meses
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  add('month', nextMonth, MONTHS[nextMonth.getMonth()], MONTHS[nextMonth.getMonth()].slice(0, 3));
  add('month', monthAfter, MONTHS[monthAfter.getMonth()], MONTHS[monthAfter.getMonth()].slice(0, 3));

  // O ano que vem
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);
  add('year', nextYear, String(nextYear.getFullYear()), String(nextYear.getFullYear()));

  return buckets;
}

/** A tarefa está guardada para depois (o horizonte ainda não chegou)? */
export function isDeferred(task: Task, now: Date = new Date()): boolean {
  if (!task.plan_horizon || !task.plan_date) return false;
  return task.plan_date > toISODate(startOfDay(now));
}

/**
 * Rótulo do horizonte de uma tarefa já adiada.
 * "Semana de 08/09" · "Setembro" · "2027"
 */
export function describeHorizon(task: Task): string | null {
  if (!task.plan_horizon || !task.plan_date) return null;
  const d = new Date(task.plan_date + 'T00:00:00');
  if (isNaN(d.getTime())) return null;

  switch (task.plan_horizon) {
    case 'day':
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
    case 'week':
      return `Semana de ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)}`;
    case 'month':
      return `${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
    case 'year':
      return String(d.getFullYear());
  }
}

/**
 * Agrupa as tarefas adiadas em gavetas na ordem do tempo, para a tela
 * "Depois". Cada gaveta é um horizonte concreto ("Semana de 08/09").
 */
export function groupDeferred(tasks: Task[], now: Date = new Date()): Array<{
  key: string;
  label: string;
  horizon: PlanHorizon;
  date: string;
  tasks: Task[];
}> {
  const map = new Map<string, { label: string; horizon: PlanHorizon; date: string; tasks: Task[] }>();

  for (const task of tasks) {
    if (!isDeferred(task, now)) continue;
    const key = `${task.plan_horizon}:${task.plan_date}`;
    const existing = map.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(key, {
        label: describeHorizon(task) ?? 'Depois',
        horizon: task.plan_horizon as PlanHorizon,
        date: task.plan_date as string,
        tasks: [task],
      });
    }
  }

  // Ordena pela data da âncora; empate desempata pela granularidade
  // (o dia vem antes da semana, que vem antes do mês).
  const rank: Record<PlanHorizon, number> = { day: 0, week: 1, month: 2, year: 3 };
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.date.localeCompare(b.date) || rank[a.horizon] - rank[b.horizon]);
}
