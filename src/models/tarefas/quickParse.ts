/**
 * Parser de captura rápida.
 *
 * Objetivo: você digita "passar no mercado amanhã 14h" e a tarefa já nasce
 * com título limpo e horário certo. Nada de abrir modal para escolher data.
 *
 * O que é reconhecido (tudo opcional, tudo em português):
 *   hoje · amanhã · depois de amanhã · seg..dom · 25/12 · 25/12/2026
 *   14h · 14:30 · 14h30 · às 9 · 9h da manhã · meio-dia · meia-noite
 *   !urgente · !alta · !media · !baixa
 *   30min · 1h30 · 2h  (duração, quando vem depois de "por"/"durante")
 *
 * Regra de ouro: se não reconhecer nada, devolve o texto intacto. O parser
 * nunca pode "comer" parte do título por engano.
 */

export interface ParsedCapture {
  /** Título já sem os trechos que viraram data/hora/prioridade. */
  title: string;
  /** Data + hora exata, quando o usuário disse a hora. */
  dueAt: Date | null;
  /** Só o dia (YYYY-MM-DD), quando o usuário disse o dia mas não a hora. */
  dueDate: string | null;
  /** Duração em minutos, quando informada. */
  durationMin: number | null;
  /** 'baixa' | 'media' | 'alta' | 'urgente' */
  priority: string | null;
  /** Repetição detectada: "toda terça" vira { freq:'weekly', weekdays:[2] }. */
  recur: { freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; weekdays: number[] } | null;
  /** Trechos consumidos, para destacar no preview da captura. */
  matched: string[];
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, 'segunda-feira': 1, seg: 1,
  terca: 2, 'terça': 2, 'terca-feira': 2, 'terça-feira': 2, ter: 2,
  quarta: 3, 'quarta-feira': 3, qua: 3,
  quinta: 4, 'quinta-feira': 4, qui: 4,
  sexta: 5, 'sexta-feira': 5, sex: 5,
  sabado: 6, 'sábado': 6, sab: 6, 'sáb': 6,
};

const PRIORITIES: Record<string, string> = {
  urgente: 'urgente',
  alta: 'alta',
  media: 'media',
  'média': 'media',
  baixa: 'baixa',
};

/** Remove acentos para comparar palavras sem sofrer com "terça"/"terca". */
function deaccent(s: string): string {
  // NFD + remocao dos diacriticos mantem o MESMO comprimento da string original
  // (cada acentuado vira base+marca e a marca sai), o que e essencial: os indices
  // do texto normalizado sao usados para recortar o texto original.
  return s.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Recorta um trecho do texto sem deixar espaço duplo para trás.
 * Trabalha sobre o texto original (com acentos) usando índices do texto
 * normalizado — por isso o normalizado precisa ter o mesmo comprimento,
 * o que `deaccent` garante (ele só troca caractere por caractere).
 */
function cut(text: string, start: number, end: number): string {
  return (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s{2,}/g, ' ').trim();
}

export function parseCapture(input: string, now: Date = new Date()): ParsedCapture {
  const result: ParsedCapture = {
    title: input.trim(),
    dueAt: null,
    dueDate: null,
    durationMin: null,
    priority: null,
    recur: null,
    matched: [],
  };
  if (!result.title) return result;

  let text = result.title;
  let day: Date | null = null;
  let hour: number | null = null;
  let minute = 0;

  // ── Prioridade: !urgente, !alta, !media, !baixa ──────────────────────────
  {
    const m = deaccent(text).match(/(^|\s)!(urgente|alta|media|baixa)\b/i);
    if (m) {
      result.priority = PRIORITIES[m[2].toLowerCase()] ?? null;
      const start = m.index! + m[1].length;
      result.matched.push(text.slice(start, start + m[0].length - m[1].length));
      text = cut(text, start, start + m[0].length - m[1].length);
    }
  }

  // ── Duração explícita: "por 30min", "durante 1h30" ───────────────────────
  {
    const m = deaccent(text).match(/(^|\s)(?:por|durante)\s+(\d{1,2})\s*(?:h|hora?s?)\s*(\d{1,2})?|(^|\s)(?:por|durante)\s+(\d{1,3})\s*(?:min|minutos?)\b/i);
    if (m) {
      if (m[2]) {
        result.durationMin = parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
      } else if (m[5]) {
        result.durationMin = parseInt(m[5], 10);
      }
      const lead = (m[1] ?? m[4] ?? '').length;
      const start = m.index! + lead;
      const end = m.index! + m[0].length;
      result.matched.push(text.slice(start, end));
      text = cut(text, start, end);
    }
  }

  // ── Repetição: "toda terça", "todo dia", "todo mês", "toda semana" ──────
  // Vem ANTES da data porque "toda terça" precisa consumir a palavra terça
  // inteira — senão o detector de dia da semana a leria como uma data solta
  // e a repetição nunca seria vista.
  {
    const norm = deaccent(text).toLowerCase();

    // "toda terca", "todas as sextas", "toda segunda-feira"
    const wd = norm.match(
      /(^|\s)tod(?:o|a|os|as)(?:\s+os|\s+as)?\s+(domingos?|segundas?(?:-feiras?)?|tercas?(?:-feiras?)?|quartas?(?:-feiras?)?|quintas?(?:-feiras?)?|sextas?(?:-feiras?)?|sabados?)\b/
    );
    // "todo dia", "todos os dias", "diariamente"
    const daily = wd ? null : norm.match(/(^|\s)(?:tod(?:o|os)(?:\s+os)?\s+dias?|diariamente)\b/);
    // "toda semana", "semanalmente"
    const weekly = wd || daily ? null : norm.match(/(^|\s)(?:toda(?:s\s+as)?\s+semanas?|semanalmente)\b/);
    // "todo mes", "mensalmente"
    const monthly = wd || daily || weekly ? null : norm.match(/(^|\s)(?:tod(?:o|os)(?:\s+os)?\s+mes(?:es)?|mensalmente)\b/);
    // "todo ano", "anualmente"
    const yearly = wd || daily || weekly || monthly ? null : norm.match(/(^|\s)(?:tod(?:o|os)(?:\s+os)?\s+anos?|anualmente)\b/);

    const hit = wd ?? daily ?? weekly ?? monthly ?? yearly;
    if (hit) {
      if (wd) {
        // Normaliza a palavra ("sextas-feiras" -> "sexta") para achar o índice.
        const stem = wd[2].replace(/-feiras?$/, '').replace(/s$/, '');
        const weekday = WEEKDAYS[stem];
        if (weekday !== undefined) {
          result.recur = { freq: 'weekly', weekdays: [weekday] };
          // A série parte da próxima ocorrência desse dia.
          const base = startOfDay(now);
          let delta = (weekday - base.getDay() + 7) % 7;
          if (delta === 0) delta = 7;
          day = new Date(base.getTime() + delta * 86400000);
        }
      } else if (daily) {
        result.recur = { freq: 'daily', weekdays: [] };
      } else if (weekly) {
        result.recur = { freq: 'weekly', weekdays: [] };
      } else if (monthly) {
        result.recur = { freq: 'monthly', weekdays: [] };
      } else {
        result.recur = { freq: 'yearly', weekdays: [] };
      }

      if (result.recur) {
        const start = hit.index! + hit[1].length;
        const end = hit.index! + hit[0].length;
        result.matched.push(text.slice(start, end));
        text = cut(text, start, end);
      }
    }
  }

  // ── Data absoluta: 25/12 ou 25/12/2026 ───────────────────────────────────
  {
    const m = text.match(/(^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const d = parseInt(m[2], 10);
      const mo = parseInt(m[3], 10);
      let y = m[4] ? parseInt(m[4], 10) : now.getFullYear();
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        const candidate = new Date(y, mo - 1, d);
        // Sem ano explícito e já passou? O usuário quer o ano que vem.
        if (!m[4] && candidate < startOfDay(now)) candidate.setFullYear(y + 1);
        day = candidate;
        const start = m.index! + m[1].length;
        const end = m.index! + m[0].length;
        result.matched.push(text.slice(start, end));
        text = cut(text, start, end);
      }
    }
  }

  // ── Data relativa: hoje / amanhã / depois de amanhã / seg..dom ────────────
  if (!day) {
    const norm = deaccent(text).toLowerCase();

    const depois = norm.match(/(^|\s)depois de amanha\b/);
    const amanha = depois ? null : norm.match(/(^|\s)amanha\b/);
    const hoje = depois || amanha ? null : norm.match(/(^|\s)hoje\b/);

    const hit = depois ?? amanha ?? hoje;
    if (hit) {
      const offset = depois ? 2 : amanha ? 1 : 0;
      day = startOfDay(new Date(now.getTime() + offset * 86400000));
      const start = hit.index! + hit[1].length;
      const end = hit.index! + hit[0].length;
      result.matched.push(text.slice(start, end));
      text = cut(text, start, end);
    } else {
      // Dia da semana: "sexta", "na terça", "seg". Sempre o próximo que vier.
      const wd = norm.match(/(^|\s)(?:na |no |nesta |neste |essa |esse )?(domingo|segunda-feira|segunda|terca-feira|terca|quarta-feira|quarta|quinta-feira|quinta|sexta-feira|sexta|sabado|dom|seg|ter|qua|qui|sex|sab)\b/);
      if (wd) {
        const target = WEEKDAYS[wd[2]];
        if (target !== undefined) {
          const base = startOfDay(now);
          let delta = (target - base.getDay() + 7) % 7;
          if (delta === 0) delta = 7; // "sexta" numa sexta = a próxima sexta
          day = new Date(base.getTime() + delta * 86400000);
          const start = wd.index! + wd[1].length;
          const end = wd.index! + wd[0].length;
          result.matched.push(text.slice(start, end));
          text = cut(text, start, end);
        }
      }
    }
  }

  // ── Hora: 14h · 14:30 · 14h30 · às 9 · meio-dia · meia-noite ─────────────
  {
    const norm = deaccent(text).toLowerCase();

    const meio = norm.match(/(^|\s)meio[- ]dia\b/);
    const meia = meio ? null : norm.match(/(^|\s)meia[- ]noite\b/);
    if (meio || meia) {
      hour = meio ? 12 : 0;
      const hit = (meio ?? meia)!;
      const start = hit.index! + hit[1].length;
      const end = hit.index! + hit[0].length;
      result.matched.push(text.slice(start, end));
      text = cut(text, start, end);
    } else {
      // "14h30", "14h", "14:30", "as 9", "as 9h da manha/tarde/noite".
      // Varre TODOS os numeros da frase e fica no primeiro que tem marcador de
      // hora ("h", ":", "as ...", "da tarde") — assim "comprar 2 caixas 14h"
      // entende 14h e nao se confunde com o 2.
      const re = /(^|\s)(?:as\s+|a\s+)?(\d{1,2})(?:\s*[h:]\s*(\d{2})?|\s*h)?(?:\s*(?:da|de)\s+(manha|tarde|noite))?\b/g;
      for (const m of Array.from(norm.matchAll(re))) {
        const raw = m[0];
        const hasMarker = /[h:]/.test(raw) || /^\s*(?:as|a)\s/.test(raw) || !!m[4];
        if (!hasMarker) continue;

        const h = parseInt(m[2], 10);
        const min = m[3] ? parseInt(m[3], 10) : 0;
        if (h < 0 || h > 23 || min < 0 || min > 59) continue;

        hour = h;
        minute = min;
        if (m[4] === 'tarde' && hour < 12) hour += 12;
        if (m[4] === 'noite' && hour < 12) hour += 12;
        if (m[4] === 'manha' && hour === 12) hour = 0;

        const cutStart = m.index! + m[1].length;
        const cutEnd = m.index! + m[0].length;
        result.matched.push(text.slice(cutStart, cutEnd));
        text = cut(text, cutStart, cutEnd);
        break;
      }
    }
  }

  // ── Monta o resultado ────────────────────────────────────────────────────
  // "todo dia às 7h" não disse QUE dia; a série começa hoje.
  if (result.recur && !day && hour === null) {
    day = startOfDay(now);
  }

  if (hour !== null) {
    const base = day ?? startOfDay(now);
    const dt = new Date(base);
    dt.setHours(hour, minute, 0, 0);
    // "às 8h" dito às 20h, sem dizer o dia = amanhã de manhã.
    if (!day && dt < now) dt.setDate(dt.getDate() + 1);
    result.dueAt = dt;
    result.dueDate = toISODate(dt);
  } else if (day) {
    result.dueDate = toISODate(day);
  }

  // Limpa preposições órfãs que sobraram ("marcar reunião às" → "marcar reunião")
  text = text.replace(/\s+(as|às|a|de|da|do|em|no|na|pra|para)\s*$/i, '').trim();

  // Se o parser comeu o título inteiro, ele errou: devolve o original.
  result.title = text || input.trim();
  if (!text) {
    result.dueAt = null;
    result.dueDate = null;
    result.durationMin = null;
    result.priority = null;
    result.recur = null;
    result.matched = [];
  }

  return result;
}

/** Rótulo curto de quando a tarefa cai — usado no preview da captura. */
export function describeWhen(parsed: ParsedCapture, now: Date = new Date()): string | null {
  if (!parsed.dueAt && !parsed.dueDate) return null;

  const target = parsed.dueAt ?? new Date(parsed.dueDate + 'T00:00:00');
  const days = Math.round(
    (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86400000
  );

  const dayLabel =
    days === 0 ? 'hoje' :
    days === 1 ? 'amanhã' :
    days === 2 ? 'depois de amanhã' :
    days > 2 && days < 7
      ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(target)
      : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(target);

  if (!parsed.dueAt) return dayLabel;

  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(parsed.dueAt);
  return `${dayLabel} às ${time}`;
}

/**
 * Quebra um texto colado em várias tarefas.
 * Aguenta listas com "-", "*", "•", "1." e numeração "1)" na frente.
 */
export function splitPastedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•–—]|\d{1,3}[.)])\s+/, '').trim())
    .filter(Boolean);
}
