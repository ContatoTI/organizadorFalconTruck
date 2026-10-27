import * as projetos from '@/src/models/projetos/projetos';
import { erro, exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const ESCOPOS = ['todos', 'basico'] as const;

/** GET /api/projetos?escopo=todos|basico — basico = só dono/membro, colunas resumidas. */
export function listarProjetos(request: Request) {
  return tratar('carregar os projetos', async () => {
    const escopo = new URL(request.url).searchParams.get('escopo') ?? 'todos';
    if (!(ESCOPOS as readonly string[]).includes(escopo)) return erro(400, 'Escopo inválido.');
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const lista = escopo === 'basico'
      ? await projetos.listarProprioseMembro(sessao.db, sessao.usuario.id)
      : await projetos.listarTodos(sessao.db, sessao.usuario.id);
    return Response.json(lista);
  });
}

export function criarProjeto(request: Request) {
  return tratar('criar o projeto', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const novo = projetos.validarNovo(await lerJson(request));
    return Response.json(await projetos.criar(sessao.db, sessao.usuario.id, novo), { status: 201 });
  });
}

export function atualizarProjeto(request: Request, idTxt: string) {
  return tratar('salvar o projeto', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const alteracao = projetos.validarAlteracao(await lerJson(request));
    return (await projetos.atualizar(sessao.db, id, alteracao))
      ? new Response(null, { status: 204 })
      : erro(403, 'Você não tem permissão para editar este projeto.');
  });
}

export function excluirProjeto(idTxt: string) {
  return tratar('excluir o projeto', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return (await projetos.excluir(sessao.db, id))
      ? new Response(null, { status: 204 })
      : erro(403, 'Você não tem permissão para excluir este projeto.');
  });
}

export function verAcesso(idTxt: string) {
  return tratar('verificar o acesso ao projeto', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await projetos.acesso(sessao.db, id, sessao.usuario.id));
  });
}

/** Página de Compartilhamentos: seus projetos com membros e os que você participa. */
export function resumoCompartilhados() {
  return tratar('carregar os projetos compartilhados', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const [queCompartilhei, queParticipo] = await Promise.all([
      projetos.projetosQueCompartilhei(sessao.db, sessao.usuario.id),
      projetos.projetosQueParticipo(sessao.db, sessao.usuario.id),
    ]);
    return Response.json({ queCompartilhei, queParticipo });
  });
}
