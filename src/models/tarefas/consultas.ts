/**
 * Leitura de tarefas: buscar uma, listar as do usuário e as delegadas.
 *
 * A listagem também aplica duas regras automáticas (que GRAVAM no banco):
 *  - tarefa com prazo vencido e não concluída vai para REVISAO;
 *  - tarefa parada há mais de 1 dia em A_FAZER/EM_ANDAMENTO vai para REVISAO
 *    com a etiqueta "Tarefa não concluída - Remanejar".
 *
 * "Hoje" vem da tela (fuso do usuário): o servidor pode estar em outro fuso,
 * e uma tarefa da noite não pode vencer mais cedo por causa disso.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export interface FiltrosTarefas {
  projetoId?: number;
  pastaId?: number;
  grupoId?: number;
  soHoje?: boolean;
  concluidas?: boolean;
  /** AAAA-MM-DD no fuso do usuário. */
  hoje: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ETIQUETA_PARADA = 'Tarefa não concluída - Remanejar';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export function validarHoje(texto: unknown): string {
  if (typeof texto !== 'string' || !DATA.test(texto)) throw new ErroValidacao('Data de hoje inválida.');
  return texto;
}

// ── Enriquecimento ──────────────────────────────────────────────────────────

async function nomesPorId(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  const { data } = await db.from('profiles').select('id, full_name, email').in('id', ids);
  (data as { id: string; full_name: string | null; email: string | null }[] | null)
    ?.forEach(p => mapa.set(p.id, p.full_name || p.email || 'Usuário'));
  return mapa;
}

/** Nome de quem criou cada tarefa. */
async function comNomesDosCriadores(db: SupabaseClient, tarefas: Task[]): Promise<Task[]> {
  const ids = [...new Set(tarefas.map(t => t.user_id))];
  if (ids.length === 0) return tarefas;
  const nomes = await nomesPorId(db, ids);
  return tarefas.map(t => ({ ...t, creator_name: nomes.get(t.user_id) || undefined }));
}

/** Nome do responsável (assignee) de cada tarefa. */
async function comNomesDosResponsaveis(db: SupabaseClient, tarefas: Task[]): Promise<Task[]> {
  const ids = [...new Set(tarefas.map(t => t.assignee_id).filter(Boolean))] as string[];
  if (ids.length === 0) return tarefas;
  const nomes = await nomesPorId(db, ids);
  return tarefas.map(t => ({
    ...t,
    assignee_name: t.assignee_id ? nomes.get(t.assignee_id) || undefined : undefined,
  }));
}

/** Grupos vinculados via task_view_groups (além do view_group_id direto). */
async function comGruposVinculados(db: SupabaseClient, tarefas: Task[]): Promise<Task[]> {
  if (tarefas.length === 0) return tarefas;
  const { data } = await db
    .from('task_view_groups')
    .select('task_id, view_group_id')
    .in('task_id', tarefas.map(t => t.id));

  const porTarefa = new Map<number, number[]>();
  for (const vinculo of (data as { task_id: number; view_group_id: number }[] | null) || []) {
    const lista = porTarefa.get(vinculo.task_id) || [];
    lista.push(vinculo.view_group_id);
    porTarefa.set(vinculo.task_id, lista);
  }
  return tarefas.map(t => ({ ...t, linked_view_group_ids: porTarefa.get(t.id) || [] }));
}

// ── Regras automáticas de revisão ───────────────────────────────────────────

/** Vencidas e não concluídas entram em revisão, em vez de ficarem pendentes para sempre. */
async function vencidasParaRevisao(db: SupabaseClient, tarefas: Task[], hoje: string): Promise<Task[]> {
  const vencidas = tarefas.filter(t => {
    if (!t.due_date || t.is_completed) return false;
    if (t.status === 'CONCLUIDO' || t.status === 'REVISAO') return false;
    return t.due_date < hoje;
  });
  if (vencidas.length === 0) return tarefas;

  const ids = vencidas.map(t => t.id);
  const { error } = await db.from('todos').update({ status: 'REVISAO' }).in('id', ids);
  if (error) {
    console.error('[tarefas] vencidasParaRevisao:', error.message);
    return tarefas;
  }

  const movidas = new Set(ids);
  return tarefas.map(t => (movidas.has(t.id) ? { ...t, status: 'REVISAO' } : t));
}

/** Paradas há mais de 1 dia vão para revisão com etiqueta, sinalizando que precisam de ação. */
async function paradasParaRevisao(db: SupabaseClient, tarefas: Task[], agoraMs = Date.now()): Promise<Task[]> {
  const limite = new Date(agoraMs - UM_DIA_MS).toISOString();
  const paradas = tarefas.filter(t => {
    if (t.is_completed) return false;
    if (t.status === 'CONCLUIDO' || t.status === 'REVISAO') return false;
    if (!t.status_changed_at) return false;
    return t.status_changed_at < limite;
  });
  if (paradas.length === 0) return tarefas;

  const agora = new Date(agoraMs).toISOString();
  const ids = paradas.map(t => t.id);
  const { error } = await db
    .from('todos')
    .update({ status: 'REVISAO', status_changed_at: agora, auto_review_reason: ETIQUETA_PARADA })
    .in('id', ids);
  if (error) {
    console.error('[tarefas] paradasParaRevisao:', error.message);
    return tarefas;
  }

  const movidas = new Set(ids);
  return tarefas.map(t => movidas.has(t.id)
    ? { ...t, status: 'REVISAO', status_changed_at: agora, auto_review_reason: ETIQUETA_PARADA }
    : t);
}

// ── Consultas ───────────────────────────────────────────────────────────────

type ConsultaTodos = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

/** Ids das tarefas vinculadas ao grupo via task_view_groups. */
async function idsVinculadosAoGrupo(db: SupabaseClient, grupoId: number): Promise<number[]> {
  const { data } = await db.from('task_view_groups').select('task_id').eq('view_group_id', grupoId);
  return ((data as { task_id: number }[] | null) || []).map(v => v.task_id);
}

/** Direto no grupo (view_group_id) OU vinculado via task_view_groups. */
function filtroDeGrupo(q: ConsultaTodos, grupoId: number, vinculadas: number[]): ConsultaTodos {
  if (vinculadas.length > 0) return q.or(`view_group_id.eq.${grupoId},id.in.(${vinculadas.join(',')})`);
  return q.eq('view_group_id', grupoId);
}

export async function buscar(db: SupabaseClient, tarefaId: number, hoje: string): Promise<Task | null> {
  const { data, error } = await db.from('todos').select('*').eq('id', tarefaId).maybeSingle();
  if (error || !data) return null;

  let tarefas = await comNomesDosCriadores(db, [data as Task]);
  tarefas = await comNomesDosResponsaveis(db, tarefas);
  tarefas = await comGruposVinculados(db, tarefas);
  tarefas = await vencidasParaRevisao(db, tarefas, hoje);
  tarefas = await paradasParaRevisao(db, tarefas);
  return tarefas[0];
}

export async function listar(db: SupabaseClient, usuarioId: string, filtros: FiltrosTarefas): Promise<Task[]> {
  const { hoje } = filtros;

  if (filtros.projetoId) {
    // Projeto específico — a RLS já garante o acesso de quem pode ver.
    let q = db.from('todos').select('*').eq('project_id', filtros.projetoId).is('deleted_at', null);
    if (filtros.pastaId) q = q.eq('section_id', filtros.pastaId);
    if (!filtros.concluidas) q = q.eq('is_completed', false);
    if (filtros.soHoje) q = q.eq('due_date', hoje);
    const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    let tarefas = await comNomesDosCriadores(db, (data as Task[]) || []);
    tarefas = await comNomesDosResponsaveis(db, tarefas);
    tarefas = await vencidasParaRevisao(db, tarefas, hoje);
    return paradasParaRevisao(db, tarefas);
  }

  // Sem projeto: várias consultas separadas (mais robusto que um OR gigante com RLS).
  const [projetosMembro, projetosProprios, vinculadasAoGrupo] = await Promise.all([
    db.from('project_members').select('project_id').eq('user_id', usuarioId),
    db.from('projects').select('id').eq('owner_id', usuarioId),
    filtros.grupoId ? idsVinculadosAoGrupo(db, filtros.grupoId) : Promise.resolve([]),
  ]);
  const idsMembro = ((projetosMembro.data as { project_id: number }[] | null) || []).map(m => m.project_id);
  const idsProprios = ((projetosProprios.data as { id: number }[] | null) || []).map(p => p.id);

  const aplicarFiltrosComuns = (base: ConsultaTodos) => {
    let q = base;
    if (filtros.pastaId) q = q.eq('section_id', filtros.pastaId);
    if (filtros.grupoId) q = filtroDeGrupo(q, filtros.grupoId, vinculadasAoGrupo);
    if (!filtros.concluidas) q = q.eq('is_completed', false);
    if (filtros.soHoje) q = q.eq('due_date', hoje);
    return q;
  };

  const todas: Task[] = [];
  const juntar = async (q: ConsultaTodos) => {
    const { data, error } = await q.order('created_at', { ascending: false });
    if (!error && data) todas.push(...(data as Task[]));
  };

  // 1. Tarefas pessoais.
  await juntar(aplicarFiltrosComuns(db.from('todos').select('*').eq('user_id', usuarioId).is('deleted_at', null)));

  // 2a. Projetos em que você é dono: todas as tarefas dos outros.
  if (idsProprios.length > 0) {
    await juntar(aplicarFiltrosComuns(
      db.from('todos').select('*').in('project_id', idsProprios).neq('user_id', usuarioId).is('deleted_at', null),
    ));
  }

  // 2b. Projetos em que você é membro: só as atribuídas a você.
  if (idsMembro.length > 0) {
    await juntar(aplicarFiltrosComuns(
      db.from('todos').select('*')
        .in('project_id', idsMembro)
        .eq('assignee_id', usuarioId)
        .neq('user_id', usuarioId)
        .is('deleted_at', null),
    ));
  }

  // 3. Pastas e tarefas compartilhadas diretamente com você.
  const [pastasComigo, tarefasComigo] = await Promise.all([
    db.from('section_shares').select('section_id').eq('user_id', usuarioId),
    db.from('task_shares').select('task_id').eq('user_id', usuarioId),
  ]);
  const idsPastas = ((pastasComigo.data as { section_id: number }[] | null) || []).map(s => s.section_id);
  const idsTarefas = ((tarefasComigo.data as { task_id: number }[] | null) || []).map(t => t.task_id);

  if (idsPastas.length > 0) {
    let q = db.from('todos').select('*').in('section_id', idsPastas).is('deleted_at', null);
    if (filtros.pastaId) q = q.eq('section_id', filtros.pastaId);
    if (!filtros.concluidas) q = q.eq('is_completed', false);
    if (filtros.soHoje) q = q.eq('due_date', hoje);
    await juntar(q);
  }
  if (idsTarefas.length > 0) {
    const { data, error } = await db.from('todos').select('*').in('id', idsTarefas).is('deleted_at', null);
    if (!error && data) todas.push(...(data as Task[]));
  }

  // Tira repetidas (fica a primeira) e ordena da mais nova para a mais antiga.
  const vistos = new Set<number>();
  const unicas: Task[] = [];
  for (const t of todas) {
    if (!vistos.has(t.id)) { vistos.add(t.id); unicas.push(t); }
  }
  unicas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  let tarefas = await comGruposVinculados(db, unicas);
  tarefas = await comNomesDosCriadores(db, tarefas);
  tarefas = await comNomesDosResponsaveis(db, tarefas);
  tarefas = await vencidasParaRevisao(db, tarefas, hoje);
  return paradasParaRevisao(db, tarefas);
}

/** Tarefas que você delegou e ainda não voltaram. */
export async function aguardando(db: SupabaseClient, usuarioId: string): Promise<Task[]> {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .eq('user_id', usuarioId)
    .eq('status', 'AGUARDANDO')
    .is('deleted_at', null)
    .order('delegated_at', { ascending: true });
  if (error) throw new Error(error.message);
  return comNomesDosResponsaveis(db, (data as Task[]) || []);
}
