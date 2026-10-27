/**
 * Escrita de tarefas: criar, alterar, concluir, excluir (lixeira),
 * adiar, delegar e repetir.
 *
 * Datas (due_date, plan_date) chegam prontas da tela, no fuso do usuário.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanHorizon, RecurFreq, Task } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export interface NovaTarefa {
  title: string;
  projectId?: number | null;
  sectionId?: number | null;
  groupId?: number | null;
  dueDate?: string | null;
  dueAt?: string | null;
  durationMin?: number | null;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  assigneeId?: string | null;
  goalId?: number | null;
  parentTaskId?: number | null;
  recur?: { freq: RecurFreq; weekdays: number[] } | null;
}

/** Colunas que a tela pode alterar. status_changed_at/auto_review_reason são geridos aqui. */
const CAMPOS_ALTERAVEIS = [
  'title', 'description', 'priority', 'status', 'is_completed',
  'due_date', 'due_at', 'duration_min',
  'plan_horizon', 'plan_date', 'delegated_at',
  'goal_id', 'parent_task_id',
  'recur_freq', 'recur_interval', 'recur_weekdays', 'recur_until', 'recur_count',
  'view_group_id', 'project_id', 'section_id', 'position', 'assignee_id',
] as const;

export type AlteracaoTarefa = Partial<Pick<Task, (typeof CAMPOS_ALTERAVEIS)[number]>>;

export interface RegraRepeticao {
  freq: RecurFreq | null;
  interval?: number | null;
  weekdays?: number[] | null;
  until?: string | null;
  count?: number | null;
}

const FREQUENCIAS: readonly RecurFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const HORIZONTES: readonly PlanHorizon[] = ['day', 'week', 'month', 'year'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Colunas de migrações recentes (duração e repetição) podem ainda não existir
 * no banco. Na primeira recusa do Postgres a coluna é desligada para este
 * servidor — melhor criar a tarefa sem o extra do que perder o que a pessoa
 * acabou de digitar.
 */
const colunasAusentes = new Set<string>();

function colunaFaltando(error: { code?: string; message?: string } | null, coluna: string): boolean {
  // O Postgres sempre nomeia a coluna na mensagem; exigir o nome evita
  // confundir "falta recur_freq" com "falta duration_min".
  if (!error?.message?.includes(coluna)) return false;
  return error.code === '42703' || error.message.includes('column');
}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ── Validação ───────────────────────────────────────────────────────────────

const idOuNulo = (v: unknown): number | null => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : null);
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function dataOuNulo(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !DATA.test(v)) throw new ErroValidacao(`${campo} inválida.`);
  return v;
}

function diasDaSemana(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
}

export function validarNova(entrada: Record<string, unknown>): NovaTarefa {
  const title = typeof entrada.title === 'string' ? entrada.title.trim() : '';
  if (!title) throw new ErroValidacao('Título não pode estar vazio');

  const dueAt = entrada.dueAt ?? null;
  if (dueAt !== null && (typeof dueAt !== 'string' || Number.isNaN(Date.parse(dueAt)))) {
    throw new ErroValidacao('Horário inválido.');
  }

  let recur: NovaTarefa['recur'] = null;
  if (entrada.recur && typeof entrada.recur === 'object') {
    const r = entrada.recur as { freq?: unknown; weekdays?: unknown };
    if (!FREQUENCIAS.includes(r.freq as RecurFreq)) throw new ErroValidacao('Repetição inválida.');
    recur = { freq: r.freq as RecurFreq, weekdays: diasDaSemana(r.weekdays) };
  }

  const assigneeId = entrada.assigneeId ?? null;
  if (assigneeId !== null && (typeof assigneeId !== 'string' || !UUID.test(assigneeId))) {
    throw new ErroValidacao('Responsável inválido.');
  }

  return {
    title,
    projectId: idOuNulo(entrada.projectId),
    sectionId: idOuNulo(entrada.sectionId),
    groupId: idOuNulo(entrada.groupId),
    dueDate: dataOuNulo(entrada.dueDate, 'Data'),
    dueAt: dueAt as string | null,
    durationMin: idOuNulo(entrada.durationMin),
    description: textoOuNulo(entrada.description),
    priority: textoOuNulo(entrada.priority),
    status: textoOuNulo(entrada.status),
    assigneeId: assigneeId as string | null,
    goalId: idOuNulo(entrada.goalId),
    parentTaskId: idOuNulo(entrada.parentTaskId),
    recur,
  };
}

/** Só passa as colunas permitidas; título vazio é recusado. */
export function validarAlteracao(entrada: Record<string, unknown>): AlteracaoTarefa {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_ALTERAVEIS) {
    if (campo in entrada) saida[campo] = entrada[campo];
  }
  if ('title' in saida) {
    const title = typeof saida.title === 'string' ? saida.title.trim() : '';
    if (!title) throw new ErroValidacao('Título não pode estar vazio');
    saida.title = title;
  }
  if ('due_date' in saida) saida.due_date = dataOuNulo(saida.due_date, 'Data');
  if (Object.keys(saida).length === 0) throw new ErroValidacao('Nada para alterar.');
  return saida as AlteracaoTarefa;
}

export function validarHorizonte(v: unknown): PlanHorizon {
  if (!HORIZONTES.includes(v as PlanHorizon)) throw new ErroValidacao('Horizonte inválido.');
  return v as PlanHorizon;
}

export function validarRepeticao(entrada: Record<string, unknown>): RegraRepeticao {
  const freq = entrada.freq ?? null;
  if (freq !== null && !FREQUENCIAS.includes(freq as RecurFreq)) throw new ErroValidacao('Repetição inválida.');
  return {
    freq: freq as RecurFreq | null,
    interval: idOuNulo(entrada.interval),
    weekdays: Array.isArray(entrada.weekdays) ? diasDaSemana(entrada.weekdays) : null,
    until: dataOuNulo(entrada.until, 'Data final'),
    count: idOuNulo(entrada.count),
  };
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria a tarefa no fim da lista de destino (pasta > projeto > pessoal),
 * com tolerância a bancos sem as migrações de duração e repetição.
 */
export async function criar(db: SupabaseClient, usuarioId: string, nova: NovaTarefa): Promise<Task> {
  // Posição: fim da lista do escopo de destino (pasta > projeto > pessoal).
  let escopo;
  if (nova.sectionId) escopo = db.from('todos').select('position').eq('section_id', nova.sectionId);
  else if (nova.projectId) escopo = db.from('todos').select('position').eq('project_id', nova.projectId);
  else {
    const pessoal = db.from('todos').select('position').eq('user_id', usuarioId);
    escopo = nova.groupId ? pessoal.eq('view_group_id', nova.groupId) : pessoal.is('view_group_id', null).is('project_id', null);
  }

  const { data: ultima } = await escopo.order('position', { ascending: false }).limit(1).maybeSingle();
  const position = ((ultima as { position: number } | null)?.position ?? -1) + 1;

  const registro: Record<string, unknown> = {
    user_id: usuarioId,
    title: nova.title,
    project_id: nova.projectId ?? null,
    section_id: nova.sectionId ?? null,
    view_group_id: nova.groupId ?? null,
    due_date: nova.dueDate ?? null,
    due_at: nova.dueAt ?? null,
    duration_min: nova.durationMin ?? null,
    position,
    is_completed: false,
    status: nova.status ?? 'A_FAZER',
    status_changed_at: new Date().toISOString(),
  };
  if (nova.description) registro.description = nova.description;
  if (nova.priority) registro.priority = nova.priority;
  if (nova.assigneeId) registro.assignee_id = nova.assigneeId;
  if (nova.goalId) registro.goal_id = nova.goalId;
  if (nova.parentTaskId) registro.parent_task_id = nova.parentTaskId;
  if (nova.recur) {
    registro.recur_freq = nova.recur.freq;
    registro.recur_interval = 1;
    registro.recur_weekdays = nova.recur.freq === 'weekly' && nova.recur.weekdays.length > 0
      ? nova.recur.weekdays
      : null;
  }
  if (colunasAusentes.has('duration_min')) delete registro.duration_min;
  if (colunasAusentes.has('recur_freq')) {
    delete registro.recur_freq;
    delete registro.recur_interval;
    delete registro.recur_weekdays;
  }

  let { data, error } = await db.from('todos').insert(registro).select().single();

  // Banco ainda sem a migração: refaz o insert sem a coluna nova.
  if (error && colunaFaltando(error, 'duration_min')) {
    colunasAusentes.add('duration_min');
    console.warn('[tarefas] todos.duration_min ausente — rode a migração do redesign. Seguindo sem duração.');
    delete registro.duration_min;
    ({ data, error } = await db.from('todos').insert(registro).select().single());
  }
  if (error && colunaFaltando(error, 'recur_freq')) {
    colunasAusentes.add('recur_freq');
    console.warn('[tarefas] colunas de repetição ausentes — rode a migração. Criando sem repetir.');
    delete registro.recur_freq;
    delete registro.recur_interval;
    delete registro.recur_weekdays;
    ({ data, error } = await db.from('todos').insert(registro).select().single());
  }

  falhou(error);
  return data as Task;
}

/** Mudança de status zera o relógio da revisão automática e limpa a etiqueta. */
export async function atualizar(db: SupabaseClient, tarefaId: number, alteracao: AlteracaoTarefa): Promise<void> {
  const final: Record<string, unknown> = { ...alteracao };
  if ('status' in alteracao && alteracao.status !== undefined) {
    final.status_changed_at = new Date().toISOString();
    if (alteracao.status !== 'REVISAO') final.auto_review_reason = null;
  }
  const { error } = await db.from('todos').update(final).eq('id', tarefaId);
  falhou(error);
}

export async function concluir(db: SupabaseClient, tarefaId: number, concluida: boolean): Promise<void> {
  const { error } = await db
    .from('todos')
    .update({
      is_completed: concluida,
      status: concluida ? 'CONCLUIDO' : 'A_FAZER',
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', tarefaId);
  falhou(error);
}

/**
 * Exclui para a Lixeira (deleted_at). Só o criador ou quem participa do
 * projeto pode excluir — a tarefa continua restaurável na Lixeira.
 */
export async function excluir(db: SupabaseClient, usuarioId: string, tarefaId: number): Promise<void> {
  const { data: tarefa } = await db.from('todos').select('user_id, project_id').eq('id', tarefaId).maybeSingle();
  if (!tarefa) throw new ErroValidacao('Tarefa não encontrada');
  const t = tarefa as { user_id: string; project_id: number | null };

  let autorizado = t.user_id === usuarioId;
  if (!autorizado && t.project_id !== null) {
    const { data: projeto } = await db.from('projects').select('owner_id').eq('id', t.project_id).maybeSingle();
    autorizado = (projeto as { owner_id: string } | null)?.owner_id === usuarioId;
    if (!autorizado) {
      const { data: membro } = await db
        .from('project_members')
        .select('id')
        .eq('project_id', t.project_id)
        .eq('user_id', usuarioId)
        .maybeSingle();
      autorizado = !!membro;
    }
  }
  if (!autorizado) throw new ErroValidacao('Apenas o criador ou membros do projeto podem excluir esta tarefa');

  const { error } = await db.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', tarefaId);
  falhou(error);
}

/**
 * Adia para um horizonte (dia/semana/mês/ano). planDate chega pronta da tela
 * (fuso do usuário). horizonte = null traz a tarefa de volta.
 * Adiar limpa due_at: "vejo isso mês que vem" é o oposto de ter hora marcada.
 */
export async function adiar(
  db: SupabaseClient,
  tarefaId: number,
  horizonte: PlanHorizon | null,
  planDate: string | null,
): Promise<void> {
  const alteracao: Record<string, unknown> = horizonte && planDate
    ? { plan_horizon: horizonte, plan_date: planDate, due_at: null }
    : { plan_horizon: null, plan_date: null };

  const { error } = await db.from('todos').update(alteracao).eq('id', tarefaId);
  if (error && (colunaFaltando(error, 'plan_horizon') || colunaFaltando(error, 'plan_date'))) {
    throw new ErroValidacao('Rode a migracao de planejamento para poder adiar tarefas.');
  }
  falhou(error);
}

/**
 * Passa a tarefa para outra pessoa: ela vai para "Aguardando" com a data,
 * para você saber há quanto tempo espera. responsavelId = null devolve para você.
 */
export async function delegar(db: SupabaseClient, tarefaId: number, responsavelId: string | null): Promise<void> {
  if (responsavelId !== null && !UUID.test(responsavelId)) throw new ErroValidacao('Responsável inválido.');
  const alteracao = responsavelId
    ? { assignee_id: responsavelId, status: 'AGUARDANDO', delegated_at: new Date().toISOString() }
    : { assignee_id: null, status: 'A_FAZER', delegated_at: null };

  const { error } = await db.from('todos').update(alteracao).eq('id', tarefaId);
  if (error && colunaFaltando(error, 'delegated_at')) {
    throw new ErroValidacao('Rode a migracao de delegacao para poder passar tarefas.');
  }
  falhou(error);
}

/**
 * Define (ou tira) a repetição. A série é uma linha só: guardamos a REGRA,
 * não as datas — quem expande é o calendário na hora de desenhar.
 */
export async function repetir(db: SupabaseClient, tarefaId: number, regra: RegraRepeticao): Promise<void> {
  const alteracao = regra.freq
    ? {
        recur_freq: regra.freq,
        recur_interval: Math.max(1, regra.interval ?? 1),
        recur_weekdays: regra.freq === 'weekly' && regra.weekdays && regra.weekdays.length > 0
          ? regra.weekdays
          : null,
        recur_until: regra.until ?? null,
        recur_count: regra.count ?? null,
      }
    : { recur_freq: null, recur_interval: 1, recur_weekdays: null, recur_until: null, recur_count: null };

  const { error } = await db.from('todos').update(alteracao).eq('id', tarefaId);
  if (error && colunaFaltando(error, 'recur_freq')) {
    throw new ErroValidacao('Rode a migracao de repeticao para poder repetir compromissos.');
  }
  falhou(error);
}

/** Só para testes: volta a tentar gravar as colunas opcionais. */
export function _reiniciarColunasAusentes() {
  colunasAusentes.clear();
}
