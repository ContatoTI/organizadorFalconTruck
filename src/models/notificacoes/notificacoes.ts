/**
 * Notificações: convites de projeto (pendentes e recusados) e avisos de
 * revisão de tarefa (task_review_notifications).
 * Busca em consultas paralelas para evitar N+1.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ErroValidacao } from '@/src/lib/erros';

export interface PendingInvite {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  inviter_name: string;
  inviter_email: string;
  created_at: string;
}

export interface DeclineNotification {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  declined_user_name: string;
  invited_user_id: string;
  created_at: string;
}

export interface TaskReviewNotification {
  id: number;
  task_id: number;
  task_title: string;
  sender_name: string;
  type: string;
  note: string | null;
  created_at: string;
}

export interface NovoAvisoTarefa {
  userId: string;
  taskId: number;
  taskTitle: string;
  senderName: string;
  type: string;
  note: string | null;
}

const COR_PADRAO = '#6366f1';
const TIPOS_AVISO = ['review', 'approved', 'rejected', 'assigned'];

/** Lança erro amigável quando o resultado é negativo (convite já usado etc.). */
export class ErroNegocio extends ErroValidacao {}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const textoObrigatorio = (v: unknown, campo: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new ErroValidacao(`Informe ${campo}.`);
  return v;
};

export function validarNovoAviso(entrada: Record<string, unknown>): NovoAvisoTarefa {
  const taskId = entrada.taskId;
  if (!Number.isInteger(taskId) || (taskId as number) <= 0) throw new ErroValidacao('Tarefa inválida.');
  const type = typeof entrada.type === 'string' ? entrada.type : 'review';
  if (!TIPOS_AVISO.includes(type)) throw new ErroValidacao('Tipo de aviso inválido.');
  return {
    userId: textoObrigatorio(entrada.userId, 'o destinatário'),
    taskId: taskId as number,
    taskTitle: textoObrigatorio(entrada.taskTitle, 'o título da tarefa'),
    senderName: typeof entrada.senderName === 'string' ? entrada.senderName : '',
    type,
    note: typeof entrada.note === 'string' && entrada.note ? entrada.note : null,
  };
}

// ── Convites ────────────────────────────────────────────────────────────────

type Projeto = { id: number; name: string; color: string | null };
type Convite = { id: number; project_id: number; created_at: string; projects: Projeto | null };

export async function convitesERecusas(db: SupabaseClient, usuarioId: string): Promise<{
  pendingInvites: PendingInvite[];
  declineNotifications: DeclineNotification[];
}> {
  // 1. Projetos do usuário (dono ou membro): onde ele vê as recusas.
  const [proprios, membro] = await Promise.all([
    db.from('projects').select('id, name, color').eq('owner_id', usuarioId),
    db.from('project_members').select('project_id').eq('user_id', usuarioId),
  ]);
  const projetoIds = new Set<number>();
  (proprios.data as { id: number }[] | null)?.forEach(p => projetoIds.add(p.id));
  (membro.data as { project_id: number }[] | null)?.forEach(m => projetoIds.add(m.project_id));

  // 2. Convites pendentes para você e recusas nos seus projetos (projeto vem do JOIN).
  const [pendentes, recusados] = await Promise.all([
    db.from('project_invites')
      .select('id, project_id, invited_by_user_id, created_at, projects(id, name, color)')
      .eq('invited_user_id', usuarioId)
      .eq('status', 'pending'),
    projetoIds.size > 0
      ? db.from('project_invites')
        .select('id, project_id, invited_user_id, created_at, projects(id, name, color)')
        .in('project_id', Array.from(projetoIds))
        .eq('status', 'declined')
      : Promise.resolve({ data: [] }),
  ]);
  const listaPendentes = (pendentes.data || []) as unknown as (Convite & { invited_by_user_id: string })[];
  const listaRecusados = (recusados.data || []) as unknown as (Convite & { invited_user_id: string })[];

  // 3. Nomes de quem convidou / recusou.
  const pessoas = new Set<string>([
    ...listaPendentes.map(i => i.invited_by_user_id),
    ...listaRecusados.map(d => d.invited_user_id),
  ]);
  const perfis = pessoas.size > 0
    ? await db.from('profiles').select('id, full_name, email').in('id', Array.from(pessoas))
    : { data: [] };
  const perfilPorId = new Map(((perfis.data || []) as { id: string; full_name: string | null; email: string | null }[])
    .map(p => [p.id, p]));

  return {
    pendingInvites: listaPendentes.map(inv => ({
      id: inv.id,
      project_id: inv.project_id,
      project_title: inv.projects?.name || 'Projeto',
      project_color: inv.projects?.color || COR_PADRAO,
      inviter_name: perfilPorId.get(inv.invited_by_user_id)?.full_name || 'Usuário',
      inviter_email: perfilPorId.get(inv.invited_by_user_id)?.email || '',
      created_at: inv.created_at,
    })),
    declineNotifications: listaRecusados.map(dec => ({
      id: dec.id,
      project_id: dec.project_id,
      project_title: dec.projects?.name || 'Projeto',
      project_color: dec.projects?.color || COR_PADRAO,
      declined_user_name: perfilPorId.get(dec.invited_user_id)?.full_name || 'Usuário',
      invited_user_id: dec.invited_user_id,
      created_at: dec.created_at,
    })),
  };
}

export async function aceitarConvite(db: SupabaseClient, usuarioId: string, conviteId: number): Promise<void> {
  // 1. O convite existe, é seu e está pendente?
  const { data: convite } = await db
    .from('project_invites')
    .select('id, status, project_id')
    .eq('id', conviteId)
    .eq('invited_user_id', usuarioId)
    .maybeSingle();
  if (!convite) throw new ErroNegocio('Convite não encontrado ou não pertence a você');
  const { status, project_id: projetoId } = convite as { status: string; project_id: number };
  if (status !== 'pending') throw new ErroNegocio('Convite já foi processado');

  // 2. Entra como membro (sem duplicar).
  const { data: jaMembro } = await db
    .from('project_members')
    .select('id')
    .eq('project_id', projetoId)
    .eq('user_id', usuarioId)
    .maybeSingle();
  if (!jaMembro) {
    const { error } = await db.from('project_members').insert({ project_id: projetoId, user_id: usuarioId });
    falhou(error);
  }

  // 3. Marca o convite como aceito.
  const { error } = await db.from('project_invites').update({ status: 'accepted' }).eq('id', conviteId);
  falhou(error);
}

export async function recusarConvite(db: SupabaseClient, usuarioId: string, conviteId: number): Promise<void> {
  const { error } = await db
    .from('project_invites')
    .update({ status: 'declined' })
    .eq('id', conviteId)
    .eq('invited_user_id', usuarioId);
  falhou(error);
}

// ── Avisos de tarefa ────────────────────────────────────────────────────────

export async function avisosNaoLidos(db: SupabaseClient, usuarioId: string): Promise<TaskReviewNotification[]> {
  const { data, error } = await db
    .from('task_review_notifications')
    .select('id, task_id, task_title, sender_name, type, note, created_at')
    .eq('user_id', usuarioId)
    .eq('is_read', false)
    .order('created_at', { ascending: false });
  falhou(error);
  return (data || []) as TaskReviewNotification[];
}

export async function criarAviso(db: SupabaseClient, aviso: NovoAvisoTarefa): Promise<void> {
  const { error } = await db.from('task_review_notifications').insert({
    user_id: aviso.userId,
    task_id: aviso.taskId,
    task_title: aviso.taskTitle,
    sender_name: aviso.senderName,
    type: aviso.type,
    note: aviso.note,
  });
  falhou(error);
}

export async function dispensarAviso(db: SupabaseClient, usuarioId: string, avisoId: number): Promise<void> {
  const { error } = await db.from('task_review_notifications').delete().eq('id', avisoId).eq('user_id', usuarioId);
  falhou(error);
}

/**
 * Aprova ou reprova uma tarefa em revisão direto pela notificação, sem abrir
 * a tarefa. Atualiza o status, avisa o responsável e o dono do projeto
 * (sem repetir e sem avisar quem revisou) e apaga a notificação resolvida.
 */
export async function resolverRevisao(
  db: SupabaseClient,
  revisor: { id: string; nome: string },
  avisoId: number,
  tarefaId: number,
  aprovar: boolean,
  observacao?: string | null,
): Promise<void> {
  const { data: tarefa } = await db
    .from('todos')
    .select('id, user_id, assignee_id, project_id, title')
    .eq('id', tarefaId)
    .maybeSingle();
  if (!tarefa) throw new ErroNegocio('Tarefa não encontrada');
  const t = tarefa as { user_id: string; assignee_id: string | null; project_id: number | null; title: string };

  const { error } = await db
    .from('todos')
    .update({ status: aprovar ? 'CONCLUIDO' : 'EM_ANDAMENTO', is_completed: aprovar })
    .eq('id', tarefaId);
  falhou(error);

  let donoProjeto: string | null = null;
  if (t.project_id) {
    const { data: projeto } = await db.from('projects').select('owner_id').eq('id', t.project_id).maybeSingle();
    donoProjeto = (projeto as { owner_id: string } | null)?.owner_id || null;
  }

  const tipo = aprovar ? 'approved' : 'rejected';
  const nota = aprovar ? null : (observacao || 'Há erros a corrigir.');
  const destinatarios = [...new Set([t.assignee_id || t.user_id, donoProjeto])]
    .filter((id): id is string => !!id && id !== revisor.id);
  // Aviso que falha não desfaz a revisão já gravada.
  for (const userId of destinatarios) {
    await criarAviso(db, { userId, taskId: tarefaId, taskTitle: t.title, senderName: revisor.nome, type: tipo, note: nota })
      .catch(e => console.error('[notificacoes] aviso de revisão não enviado:', e));
  }

  await dispensarAviso(db, revisor.id, avisoId);
}
