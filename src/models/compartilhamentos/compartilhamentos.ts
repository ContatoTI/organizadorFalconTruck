/**
 * Compartilhamento granular: pasta (section) inteira ou tarefa única.
 * Complementa o compartilhamento de projeto inteiro (membros do projeto).
 * Quem pode compartilhar é decidido pela RLS de section_shares/task_shares.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SectionShare, TaskShare, User } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';
import * as perfis from '@/src/models/perfis/perfis';

export type TipoCompartilhamento = 'pasta' | 'tarefa';

const TABELAS = {
  pasta: { tabela: 'section_shares', coluna: 'section_id' },
  tarefa: { tabela: 'task_shares', coluna: 'task_id' },
} as const;

/** Violação de UNIQUE: já estava compartilhado, não é erro. */
const JA_EXISTE = '23505';
const LIMITE_USUARIOS = 50;

export function validarTipo(tipo: string): TipoCompartilhamento {
  if (tipo !== 'pasta' && tipo !== 'tarefa') throw new ErroValidacao('Tipo de compartilhamento inválido.');
  return tipo;
}

export function validarUsuarioId(id: unknown): string {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ErroValidacao('Usuário inválido.');
  return id;
}

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listarAcessos(db: SupabaseClient, tipo: TipoCompartilhamento, id: number): Promise<(SectionShare | TaskShare)[]> {
  const { tabela, coluna } = TABELAS[tipo];
  const { data, error } = await db.from(tabela).select(`id, ${coluna}, user_id, created_at`).eq(coluna, id);
  falhou(error);
  return (data as (SectionShare | TaskShare)[]) || [];
}

export async function compartilhar(db: SupabaseClient, tipo: TipoCompartilhamento, id: number, usuarioId: string): Promise<void> {
  const { tabela, coluna } = TABELAS[tipo];
  const { error } = await db.from(tabela).insert({ [coluna]: id, user_id: usuarioId });
  if (error && (error as { code?: string }).code !== JA_EXISTE) throw new Error(error.message);
}

export async function descompartilhar(db: SupabaseClient, tipo: TipoCompartilhamento, id: number, usuarioId: string): Promise<void> {
  const { tabela, coluna } = TABELAS[tipo];
  const { error } = await db.from(tabela).delete().eq(coluna, id).eq('user_id', usuarioId);
  falhou(error);
}

/**
 * Define (ou remove) o "dono automático" da pasta: toda tarefa criada
 * nela já nasce direcionada a esse usuário (assignee_id), sem precisar marcar.
 * Marcar como responsável já dá acesso à pasta.
 */
export async function definirResponsavelPadrao(db: SupabaseClient, pastaId: number, usuarioId: string | null): Promise<void> {
  const { error } = await db.from('sections').update({ default_assignee_id: usuarioId }).eq('id', pastaId);
  falhou(error);
  if (usuarioId) await compartilhar(db, 'pasta', pastaId, usuarioId);
}

/** Pessoas que aparecem na lista para compartilhar (todas menos você). */
export function usuariosParaCompartilhar(db: SupabaseClient, usuarioId: string): Promise<User[]> {
  return perfis.listar(db, { excluirId: usuarioId, limite: LIMITE_USUARIOS });
}

type Pasta = { id: number; project_id: number; title: string; color: string | null; order: number; user_id?: string };
type Projeto = { id: number; name: string; color: string | null; owner_id?: string };
type Perfil = { id: string; full_name: string | null; email: string | null };

/** Suas pastas que têm compartilhamentos ativos, com as pessoas que têm acesso. */
export async function pastasQueCompartilhei(db: SupabaseClient, usuarioId: string) {
  const { data: pastas, error } = await db
    .from('sections')
    .select('id, project_id, title, color, order')
    .eq('user_id', usuarioId);
  falhou(error);
  if (!pastas || pastas.length === 0) return [];

  const { data: acessos, error: erroAcessos } = await db
    .from('section_shares')
    .select('section_id, user_id')
    .in('section_id', (pastas as Pasta[]).map(s => s.id));
  falhou(erroAcessos);
  if (!acessos || acessos.length === 0) return [];

  const lista = acessos as { section_id: number; user_id: string }[];
  const pastasCompartilhadas = [...new Set(lista.map(s => s.section_id))];
  const usuarioIds = [...new Set(lista.map(s => s.user_id))];

  const [{ data: projetos }, { data: perfis }] = await Promise.all([
    db.from('projects').select('id, name, color').in('id', (pastas as Pasta[]).map(s => s.project_id)),
    db.from('profiles').select('id, full_name, email').in('id', usuarioIds),
  ]);

  const projetoPorId = new Map(((projetos || []) as Projeto[]).map(p => [p.id, p]));
  const perfilPorId = new Map(((perfis || []) as Perfil[]).map(p => [p.id, p]));

  return pastasCompartilhadas.map(pastaId => {
    const section = (pastas as Pasta[]).find(s => s.id === pastaId)!;
    return {
      section,
      project: projetoPorId.get(section.project_id) || null,
      users: lista.filter(s => s.section_id === pastaId).map(s => perfilPorId.get(s.user_id) || null).filter(Boolean),
    };
  });
}

/** Pastas compartilhadas COM você, com o projeto e o dono. */
export async function pastasCompartilhadasComigo(db: SupabaseClient, usuarioId: string) {
  const { data: acessos, error } = await db
    .from('section_shares')
    .select('section_id, created_at')
    .eq('user_id', usuarioId);
  falhou(error);
  if (!acessos || acessos.length === 0) return [];

  const { data: pastas, error: erroPastas } = await db
    .from('sections')
    .select('id, project_id, title, color, order, user_id')
    .in('id', (acessos as { section_id: number }[]).map(s => s.section_id));
  falhou(erroPastas);
  if (!pastas || pastas.length === 0) return [];

  const lista = pastas as Pasta[];
  const [{ data: projetos }, { data: perfis }] = await Promise.all([
    db.from('projects').select('id, name, color, owner_id').in('id', [...new Set(lista.map(s => s.project_id))]),
    db.from('profiles').select('id, full_name, email').in('id', [...new Set(lista.map(s => s.user_id))]),
  ]);

  const projetoPorId = new Map(((projetos || []) as Projeto[]).map(p => [p.id, p]));
  const perfilPorId = new Map(((perfis || []) as Perfil[]).map(p => [p.id, p]));

  return lista.map(section => ({
    section,
    project: projetoPorId.get(section.project_id) || null,
    owner: perfilPorId.get(section.user_id!) || null,
  }));
}
