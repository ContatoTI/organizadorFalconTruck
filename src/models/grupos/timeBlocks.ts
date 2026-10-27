/**
 * Regras dos blocos de tempo ("hora do almoço", "fim de tarde", ...).
 *
 * O ponto do modo Agora: uma tarefa jogada num bloco some da vista e só
 * reaparece quando aquele horário chega. Estas funções decidem esse "chegou".
 */

import type { Group, BlockSchedule } from '@/types/index';

/** "12:00:00" → minutos desde a meia-noite. Devolve null se não der para ler. */
function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * "12:00 – 13:30" do dia de `date`. Null quando o bloco não roda nesse dia.
 * Como o horário varia por dia, o rótulo precisa saber de que dia se fala.
 */
export function blockTimeLabel(group: Group, date: Date = new Date()): string | null {
  const slot = scheduleForDay(group, date);
  if (!slot) return null;

  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  if (start === null && end === null) return null;

  const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  if (start !== null && end !== null && start !== end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt((start ?? end)!);
}

/** Resumo dos dias em que o bloco roda: "Seg, Ter, Qui" ou "Todo dia". */
export function blockDaysLabel(group: Group): string {
  const schedules = parseSchedules(group);
  const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (schedules.length > 0) {
    if (schedules.length === 7) return 'Todo dia';
    return schedules
      .slice()
      .sort((a, b) => a.day - b.day)
      .map(s => names[s.day])
      .join(', ');
  }

  const days = group.recurrence_days;
  if (!Array.isArray(days) || days.length === 0 || days.length === 7) return 'Todo dia';
  return days.slice().sort((a, b) => a - b).map(d => names[d]).join(', ');
}

/**
 * Horários por dia da semana, quando o bloco tem duração diferente em cada dia
 * ("segunda é rodízio, então vai das 11h às 14h; terça começa às 6h").
 *
 * Se `schedules` tiver qualquer entrada, ela manda por completo: o bloco só
 * roda nos dias listados. Sem `schedules`, vale o modelo antigo
 * (start_time + end_time + recurrence_days), e nada do que já existia muda.
 */
export function parseSchedules(group: Group): BlockSchedule[] {
  const raw = group.schedules;
  if (!raw) return [];

  // A coluna é jsonb: pode chegar como array ou como string, dependendo de
  // como foi gravada. Aceita os dois para não quebrar em dados legados.
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];

  return list.filter((item): item is BlockSchedule => {
    if (!item || typeof item !== 'object') return false;
    const s = item as Record<string, unknown>;
    return typeof s.day === 'number' && s.day >= 0 && s.day <= 6
      && typeof s.start === 'string' && typeof s.end === 'string';
  });
}

/** O horário que vale para o bloco no dia de `date`, já resolvido. */
export function scheduleForDay(group: Group, date: Date): { start: string; end: string } | null {
  const schedules = parseSchedules(group);

  if (schedules.length > 0) {
    const hit = schedules.find(s => s.day === date.getDay());
    return hit ? { start: hit.start, end: hit.end } : null;
  }

  const days = group.recurrence_days;
  const runs = !Array.isArray(days) || days.length === 0 || days.includes(date.getDay());
  if (!runs) return null;
  if (!group.start_time && !group.end_time) return null;

  return { start: group.start_time ?? group.end_time!, end: group.end_time ?? group.start_time! };
}

/** O bloco vale para o dia da semana de `now`? */
function runsToday(group: Group, now: Date): boolean {
  return scheduleForDay(group, now) !== null;
}

/**
 * O horário do bloco chegou?
 * Blocos que viram a meia-noite (22:00 – 02:00) são tratados corretamente.
 * Bloco sem horário nenhum nunca é "agora" — ele é uma gaveta, não um horário.
 */
export function isBlockActiveNow(group: Group, now: Date = new Date()): boolean {
  if (group.type !== 'time') return false;

  const slot = scheduleForDay(group, now);
  if (!slot) return false;

  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  if (start === null && end === null) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();

  if (start !== null && end !== null) {
    return end >= start
      ? minutes >= start && minutes < end
      : minutes >= start || minutes < end; // atravessa a meia-noite
  }
  // Só um dos lados: considera uma janela de 1 hora a partir do horário dado.
  const single = (start ?? end)!;
  return minutes >= single && minutes < single + 60;
}

/**
 * Quantos minutos faltam para o bloco começar hoje.
 * Devolve null se ele já passou hoje ou não tem horário.
 */
export function minutesUntilBlock(group: Group, now: Date = new Date()): number | null {
  const slot = scheduleForDay(group, now);
  if (!slot) return null;
  const start = toMinutes(slot.start);
  if (start === null) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const delta = start - minutes;
  return delta > 0 ? delta : null;
}

/** "em 25 min" · "em 2h10" — usado no rótulo do próximo bloco. */
export function formatCountdown(minutes: number): string {
  if (minutes < 60) return `em ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `em ${h}h` : `em ${h}h${pad(m)}`;
}

/**
 * Ordena os blocos como o dia acontece: o que está rolando agora primeiro,
 * depois os que ainda vêm hoje, e por último os que já passaram.
 */
export function sortBlocksByRelevance(groups: Group[], now: Date = new Date()): Group[] {
  const rank = (g: Group): number => {
    if (isBlockActiveNow(g, now)) return 0;
    if (minutesUntilBlock(g, now) !== null) return 1;
    return 2;
  };
  return [...groups].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const sa = toMinutes(scheduleForDay(a, now)?.start ?? null) ?? 9999;
    const sb = toMinutes(scheduleForDay(b, now)?.start ?? null) ?? 9999;
    return sa - sb;
  });
}
