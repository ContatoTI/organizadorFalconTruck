/**
 * Membros e convites de projeto (project_members / project_invites).
 * Aceitar e recusar convite ficam em Notificações (é quem recebe que decide).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectMember } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listarMembros(db: SupabaseClient, projetoId: number): Promise<ProjectMember[]> {
  const { data, error } = await db.from('project_members').select('id, user_id').eq('project_id', projetoId);
  falhou(error);
  return ((data || []) as { id: number; user_id: string }[]).map(m => ({ id: m.id, project_id: projetoId, user_id: m.user_id }));
}

/** Ids de quem tem convite pendente no projeto. */
export async function convitesPendentes(db: SupabaseClient, projetoId: number): Promise<string[]> {
  const { data, error } = await db
    .from('project_invites')
    .select('invited_user_id')
    .eq('project_id', projetoId)
    .eq('status', 'pending');
  falhou(error);
  return ((data || []) as { invited_user_id: string }[]).map(i => i.invited_user_id);
}

/** Convida, sem duplicar: recusa se a pessoa já é membro ou já tem convite pendente. */
export async function convidar(db: SupabaseClient, projetoId: number, convidadoId: string, quemConvidaId: string): Promise<void> {
  const { data: jaMembro } = await db
    .from('project_members')
    .select('id')
    .eq('project_id', projetoId)
    .eq('user_id', convidadoId)
    .maybeSingle();
  if (jaMembro) throw new ErroValidacao('Usuário já é membro do projeto');

  const { data: jaConvidado } = await db
    .from('project_invites')
    .select('id')
    .eq('project_id', projetoId)
    .eq('invited_user_id', convidadoId)
    .eq('status', 'pending')
    .maybeSingle();
  if (jaConvidado) throw new ErroValidacao('Convite pendente já existe para este usuário');

  const { error } = await db.from('project_invites').insert({
    project_id: projetoId,
    invited_user_id: convidadoId,
    invited_by_user_id: quemConvidaId,
    status: 'pending',
  });
  falhou(error);
}

export async function cancelarConvitePendente(db: SupabaseClient, projetoId: number, convidadoId: string): Promise<void> {
  const { error } = await db
    .from('project_invites')
    .delete()
    .eq('project_id', projetoId)
    .eq('invited_user_id', convidadoId)
    .eq('status', 'pending');
  falhou(error);
}

/** Convida de novo quem tinha recusado: apaga o convite antigo e cria outro. */
export async function reconvidar(db: SupabaseClient, projetoId: number, convidadoId: string, quemConvidaId: string): Promise<void> {
  const { error } = await db
    .from('project_invites')
    .delete()
    .eq('project_id', projetoId)
    .eq('invited_user_id', convidadoId);
  falhou(error);
  await convidar(db, projetoId, convidadoId, quemConvidaId);
}

/** Apaga o aviso de "fulano recusou" (o próprio convite recusado). */
export async function apagarConviteRecusado(db: SupabaseClient, conviteId: number): Promise<void> {
  const { error } = await db.from('project_invites').delete().eq('id', conviteId).eq('status', 'declined');
  falhou(error);
}

/** Só o dono do projeto remove membros. */
export async function removerMembro(db: SupabaseClient, projetoId: number, membroUsuarioId: string, quemPedeId: string): Promise<void> {
  const { data: projeto } = await db.from('projects').select('owner_id').eq('id', projetoId).maybeSingle();
  if ((projeto as { owner_id: string } | null)?.owner_id !== quemPedeId) {
    throw new ErroValidacao('Apenas o dono pode remover membros');
  }

  const { data: membro } = await db
    .from('project_members')
    .select('id')
    .eq('project_id', projetoId)
    .eq('user_id', membroUsuarioId)
    .maybeSingle();
  if (!membro) throw new ErroValidacao('Membro não encontrado');

  const { error } = await db.from('project_members').delete().eq('id', (membro as { id: number }).id);
  falhou(error);
}
