/**
 * Projetos: listar, criar, alterar e excluir; saber se você é dono/membro;
 * e os resumos da página de Compartilhamentos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@/types/index';
import { ErroValidacao } from '@/src/lib/erros';

export type AlteracaoProjeto = Partial<Pick<Project, 'name' | 'color' | 'description' | 'show_on_dashboard'>>;

const CAMPOS_ALTERAVEIS = ['name', 'color', 'description', 'show_on_dashboard'] as const;
const COLUNAS_BASICAS = 'id, owner_id, name, color, show_on_dashboard, created_at';
const COR_PADRAO = '#6366f1';
const MAX_PASTAS_INICIAIS = 50;

function falhou(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const unicos = <T extends { id: number }>(lista: T[]) => Array.from(new Map(lista.map(p => [p.id, p])).values());

// ── Validação ───────────────────────────────────────────────────────────────

export function validarNovo(entrada: Record<string, unknown>): { nome: string; cor: string; pastas: string[] } {
  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : '';
  if (!nome) throw new ErroValidacao('Título não pode estar vazio');
  const cor = typeof entrada.cor === 'string' && entrada.cor ? entrada.cor : COR_PADRAO;
  const pastas = Array.isArray(entrada.pastas)
    ? entrada.pastas.filter((t): t is string => typeof t === 'string').map(t => t.trim()).filter(Boolean)
    : [];
  if (pastas.length > MAX_PASTAS_INICIAIS) throw new ErroValidacao('Pastas demais de uma vez.');
  return { nome, cor, pastas };
}

export function validarAlteracao(entrada: Record<string, unknown>): AlteracaoProjeto {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_ALTERAVEIS) {
    if (campo in entrada) saida[campo] = entrada[campo];
  }
  if ('name' in saida) {
    const nome = typeof saida.name === 'string' ? saida.name.trim() : '';
    if (!nome) throw new ErroValidacao('Título não pode estar vazio');
    saida.name = nome;
  }
  if ('show_on_dashboard' in saida && typeof saida.show_on_dashboard !== 'boolean') {
    throw new ErroValidacao('Visibilidade inválida.');
  }
  if (Object.keys(saida).length === 0) throw new ErroValidacao('Nada para alterar.');
  return saida as AlteracaoProjeto;
}

// ── Listagens ───────────────────────────────────────────────────────────────

/** Projetos que você é dono ou membro (sem os alcançados só por pasta/tarefa). */
export async function listarProprioseMembro(db: SupabaseClient, usuarioId: string): Promise<Project[]> {
  const [proprios, membro] = await Promise.all([
    db.from('projects').select(COLUNAS_BASICAS).eq('owner_id', usuarioId),
    db.from('project_members').select('project_id').eq('user_id', usuarioId),
  ]);
  falhou(proprios.error);
  const ids = ((membro.data || []) as { project_id: number }[]).map(m => m.project_id);

  let compartilhados: Project[] = [];
  if (ids.length > 0) {
    const { data } = await db.from('projects').select(COLUNAS_BASICAS).in('id', ids);
    compartilhados = (data || []) as Project[];
  }
  return unicos([...((proprios.data || []) as Project[]), ...compartilhados]);
}

/**
 * IDs de projetos onde você só tem acesso por pasta/tarefa compartilhada ou
 * tarefa atribuída — não é dono nem membro do projeto inteiro.
 */
async function idsSoPorCompartilhamento(db: SupabaseClient, usuarioId: string): Promise<number[]> {
  const [pastas, tarefas, atribuidas] = await Promise.all([
    db.from('section_shares').select('section_id').eq('user_id', usuarioId),
    db.from('task_shares').select('task_id').eq('user_id', usuarioId),
    db.from('todos').select('project_id').eq('assignee_id', usuarioId).not('project_id', 'is', null),
  ]);
  const pastaIds = ((pastas.data || []) as { section_id: number }[]).map(s => s.section_id);
  const tarefaIds = ((tarefas.data || []) as { task_id: number }[]).map(t => t.task_id);

  const [projetosDasPastas, projetosDasTarefas] = await Promise.all([
    pastaIds.length > 0 ? db.from('sections').select('project_id').in('id', pastaIds) : Promise.resolve({ data: [] }),
    tarefaIds.length > 0 ? db.from('todos').select('project_id').in('id', tarefaIds) : Promise.resolve({ data: [] }),
  ]);

  const ids = new Set<number>();
  for (const linha of [
    ...((projetosDasPastas.data || []) as { project_id: number | null }[]),
    ...((projetosDasTarefas.data || []) as { project_id: number | null }[]),
    ...((atribuidas.data || []) as { project_id: number | null }[]),
  ]) {
    if (linha.project_id != null) ids.add(linha.project_id);
  }
  return Array.from(ids);
}

/**
 * Busca projetos por id. Projeto recém-compartilhado pode demorar a aparecer
 * por causa da RLS; por isso tenta de novo algumas vezes antes de desistir.
 */
async function buscarPorIds(db: SupabaseClient, ids: number[], tentativas = 3, esperaMs = 200): Promise<Project[]> {
  for (let i = 0; i <= tentativas; i++) {
    const { data, error } = await db.from('projects').select('*').in('id', ids);
    if (!error && data && data.length === ids.length) return data as Project[];
    if (i < tentativas) await new Promise(r => setTimeout(r, esperaMs * (i + 1)));
  }
  // Última tentativa: tudo o que a RLS deixa ver, filtrado pelos ids.
  const { data } = await db.from('projects').select('*');
  const procurados = new Set(ids);
  return ((data || []) as Project[]).filter(p => procurados.has(p.id));
}

/** Todos os projetos que aparecem para você: dono, membro, ou por pasta/tarefa compartilhada. */
export async function listarTodos(db: SupabaseClient, usuarioId: string, esperaMs = 200): Promise<Project[]> {
  const [proprios, membro, soCompartilhados] = await Promise.all([
    db.from('projects').select('*').eq('owner_id', usuarioId),
    db.from('project_members').select('project_id').eq('user_id', usuarioId),
    idsSoPorCompartilhamento(db, usuarioId),
  ]);
  falhou(proprios.error);
  falhou(membro.error);

  const meus = (proprios.data || []) as Project[];
  const meusIds = new Set(meus.map(p => p.id));
  const outrosIds = [...new Set([
    ...((membro.data || []) as { project_id: number | null }[]).map(m => m.project_id).filter((id): id is number => id != null),
    ...soCompartilhados,
  ])].filter(id => !meusIds.has(id));

  const outros = outrosIds.length > 0 ? await buscarPorIds(db, outrosIds, 3, esperaMs) : [];
  return unicos([...meus, ...outros]);
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/** Cria o projeto e, se vierem, as pastas iniciais (na ordem dada). */
export async function criar(db: SupabaseClient, usuarioId: string, novo: { nome: string; cor: string; pastas: string[] }): Promise<Project> {
  const { data, error } = await db
    .from('projects')
    .insert({ owner_id: usuarioId, name: novo.nome, color: novo.cor })
    .select()
    .single();
  falhou(error);
  const projeto = data as Project;

  if (novo.pastas.length > 0) {
    const { error: erroPastas } = await db.from('sections').insert(
      novo.pastas.map((title, order) => ({ user_id: usuarioId, project_id: projeto.id, title, order })),
    );
    if (erroPastas) console.error('[projetos] pastas iniciais não criadas:', erroPastas.message);
  }
  return projeto;
}

/** Devolve false quando a RLS não deixou alterar (você não tem permissão). */
export async function atualizar(db: SupabaseClient, projetoId: number, alteracao: AlteracaoProjeto): Promise<boolean> {
  const { data, error } = await db.from('projects').update(alteracao).eq('id', projetoId).select('id');
  falhou(error);
  return (data ?? []).length > 0;
}

/**
 * Exclui o projeto. As tarefas voltam para a Caixa de Entrada (sem projeto e
 * sem pasta) antes de apagar — o banco também solta, mas fica explícito.
 */
export async function excluir(db: SupabaseClient, projetoId: number): Promise<boolean> {
  const soltar = await db.from('todos').update({ project_id: null, section_id: null }).eq('project_id', projetoId);
  falhou(soltar.error);
  const { data, error } = await db.from('projects').delete().eq('id', projetoId).select('id');
  falhou(error);
  return (data ?? []).length > 0;
}

// ── Acesso ──────────────────────────────────────────────────────────────────

export async function acesso(db: SupabaseClient, projetoId: number, usuarioId: string): Promise<{ dono: boolean; membro: boolean }> {
  const { data: projeto } = await db.from('projects').select('owner_id').eq('id', projetoId).maybeSingle();
  const dono = (projeto as { owner_id: string } | null)?.owner_id === usuarioId;
  if (dono) return { dono: true, membro: true };

  const { data: membro } = await db
    .from('project_members')
    .select('id')
    .eq('project_id', projetoId)
    .eq('user_id', usuarioId)
    .maybeSingle();
  return { dono: false, membro: !!membro };
}

// ── Página de Compartilhamentos ─────────────────────────────────────────────

type Perfil = { id: string; full_name: string | null; email: string | null };

/** Seus projetos que têm membros, com os perfis deles. */
export async function projetosQueCompartilhei(db: SupabaseClient, usuarioId: string) {
  const { data: meus } = await db.from('projects').select('id, name, color').eq('owner_id', usuarioId);
  if (!meus || meus.length === 0) return [];
  const projetos = meus as { id: number; name: string; color: string }[];

  const { data: membros } = await db
    .from('project_members')
    .select('project_id, user_id')
    .in('project_id', projetos.map(p => p.id));
  if (!membros || membros.length === 0) return [];
  const lista = membros as { project_id: number; user_id: string }[];

  const { data: perfis } = await db
    .from('profiles')
    .select('id, full_name, email')
    .in('id', [...new Set(lista.map(m => m.user_id))]);
  const perfilPorId = new Map(((perfis || []) as Perfil[]).map(p => [p.id, p]));

  return projetos
    .map(project => ({
      project,
      members: lista.filter(m => m.project_id === project.id).map(m => perfilPorId.get(m.user_id) || null).filter(Boolean),
    }))
    .filter(p => p.members.length > 0);
}

/** Projetos em que você é membro (não dono), com o dono e quantos membros têm. */
export async function projetosQueParticipo(db: SupabaseClient, usuarioId: string) {
  const { data: participacoes } = await db.from('project_members').select('project_id').eq('user_id', usuarioId);
  if (!participacoes || participacoes.length === 0) return [];
  const projetoIds = (participacoes as { project_id: number }[]).map(m => m.project_id);

  const { data: projetos } = await db.from('projects').select('id, name, color, owner_id').in('id', projetoIds);
  if (!projetos || projetos.length === 0) return [];
  const lista = projetos as { id: number; name: string; color: string; owner_id: string }[];

  const [{ data: todosMembros }, { data: perfis }] = await Promise.all([
    db.from('project_members').select('project_id, user_id').in('project_id', projetoIds),
    db.from('profiles').select('id, full_name, email').in('id', [...new Set(lista.map(p => p.owner_id))]),
  ]);
  const perfilPorId = new Map(((perfis || []) as Perfil[]).map(p => [p.id, p]));
  const contagem = new Map<number, number>();
  for (const m of (todosMembros || []) as { project_id: number }[]) {
    contagem.set(m.project_id, (contagem.get(m.project_id) || 0) + 1);
  }

  return lista.map(project => ({
    project,
    owner: perfilPorId.get(project.owner_id) || null,
    memberCount: contagem.get(project.id) || 0,
  }));
}
