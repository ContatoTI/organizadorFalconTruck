/**
 * Agenda do calendário: horário das tarefas (due_at/due_date/duration_min)
 * e o estado de cada data de séries que se repetem (todo_occurrences).
 *
 * due_date chega pronta da tela, no fuso do usuário: calcular aqui no
 * servidor (que pode estar em UTC) faria a tarefa da noite pular de dia.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaskOccurrence } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export interface Horario {
  /** Instante ISO; null tira a tarefa da agenda. */
  dueAt: string | null;
  /** AAAA-MM-DD no fuso do usuário; null junto com dueAt null. */
  dueDate: string | null;
  /** undefined = não mexe na duração. */
  durationMin?: number | null;
}

export interface EstadoOcorrencia {
  completed?: boolean;
  skipped?: boolean;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DURACAO_MAXIMA = 24 * 60;

/**
 * A coluna todos.duration_min vem de uma migração. Enquanto ela não existir
 * no banco, agendar continua funcionando — sem duração. Na primeira recusa
 * do Postgres a coluna é desligada para este servidor.
 */
let colunaDuracaoExiste = true;

function colunaFaltando(error: { code?: string; message?: string } | null, coluna: string): boolean {
  if (!error) return false;
  return error.code === '42703' || (error.message?.includes(coluna) === true && error.message.includes('column'));
}

export function validarData(texto: unknown, campo = 'Data'): string {
  if (typeof texto !== 'string' || !DATA.test(texto)) throw new ErroValidacao(`${campo} inválida.`);
  return texto;
}

export function validarHorario(entrada: Record<string, unknown>): Horario {
  const dueAt = entrada.dueAt ?? null;
  if (dueAt !== null && (typeof dueAt !== 'string' || Number.isNaN(Date.parse(dueAt)))) {
    throw new ErroValidacao('Horário inválido.');
  }
  const dueDate = dueAt === null ? null : validarData(entrada.dueDate, 'Data');

  const horario: Horario = { dueAt: dueAt as string | null, dueDate };
  if ('durationMin' in entrada) {
    const d = entrada.durationMin;
    if (d !== null && (!Number.isInteger(d) || (d as number) < 0 || (d as number) > DURACAO_MAXIMA)) {
      throw new ErroValidacao('Duração inválida.');
    }
    horario.durationMin = d as number | null;
  }
  return horario;
}

export function validarEstado(entrada: Record<string, unknown>): EstadoOcorrencia {
  const estado: EstadoOcorrencia = {};
  if (typeof entrada.completed === 'boolean') estado.completed = entrada.completed;
  if (typeof entrada.skipped === 'boolean') estado.skipped = entrada.skipped;
  if (Object.keys(estado).length === 0) throw new ErroValidacao('Nada para alterar.');
  return estado;
}

/** Grava na tarefa, tirando duration_min se a coluna ainda não existir. */
async function gravarNaTarefa(db: SupabaseClient, tarefaId: number, alteracao: Record<string, unknown>): Promise<void> {
  if (!colunaDuracaoExiste) delete alteracao.duration_min;
  let { error } = await db.from('todos').update(alteracao).eq('id', tarefaId);

  if (error && 'duration_min' in alteracao && colunaFaltando(error, 'duration_min')) {
    colunaDuracaoExiste = false;
    delete alteracao.duration_min;
    ({ error } = await db.from('todos').update(alteracao).eq('id', tarefaId));
  }
  if (error) throw new Error(error.message);
}

/** Agenda (ou reagenda) num horário exato — arrastar para o calendário ou redimensionar. */
export function agendar(db: SupabaseClient, tarefaId: number, horario: Horario): Promise<void> {
  const alteracao: Record<string, unknown> = { due_at: horario.dueAt, due_date: horario.dueDate };
  if (horario.durationMin !== undefined) alteracao.duration_min = horario.durationMin;
  return gravarNaTarefa(db, tarefaId, alteracao);
}

/**
 * Dia inteiro, numa escrita só: limpar o horário e gravar o dia em chamadas
 * separadas abre uma corrida em que due_date pode acabar nulo.
 */
export function agendarDiaInteiro(db: SupabaseClient, tarefaId: number, dia: string): Promise<void> {
  return gravarNaTarefa(db, tarefaId, { due_at: null, due_date: dia, duration_min: null });
}

/** O que já aconteceu nas datas de séries que se repetem, no período. */
export async function ocorrencias(db: SupabaseClient, usuarioId: string, de: string, ate: string): Promise<TaskOccurrence[]> {
  const { data, error } = await db
    .from('todo_occurrences')
    .select('*')
    .eq('user_id', usuarioId)
    .gte('occurrence_date', de)
    .lte('occurrence_date', ate);
  if (error) throw new Error(error.message);
  return (data as TaskOccurrence[]) || [];
}

/** Marca (ou desmarca) UMA data da série, sem mexer nas outras. */
export async function marcarOcorrencia(
  db: SupabaseClient,
  usuarioId: string,
  tarefaId: number,
  data: string,
  estado: EstadoOcorrencia,
  agora = new Date(),
): Promise<void> {
  const registro: Record<string, unknown> = { user_id: usuarioId, task_id: tarefaId, occurrence_date: data };
  if (estado.completed !== undefined) {
    registro.is_completed = estado.completed;
    registro.completed_at = estado.completed ? agora.toISOString() : null;
  }
  if (estado.skipped !== undefined) registro.is_skipped = estado.skipped;

  const { error } = await db.from('todo_occurrences').upsert(registro, { onConflict: 'task_id,occurrence_date' });
  if (error) throw new Error(error.message);
}

/** Só para testes: volta a tentar gravar duration_min. */
export function _reiniciarColunaDuracao() {
  colunaDuracaoExiste = true;
}
