import * as metas from '@/src/models/metas/metas';
import { exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

export function listarMetas() {
  return tratar('carregar os objetivos', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await metas.listar(sessao.db, sessao.usuario.id));
  });
}

export function listarTarefasDasMetas(request: Request) {
  return tratar('carregar as tarefas dos objetivos', async () => {
    const ids = metas.lerIds(new URL(request.url).searchParams.get('ids'));
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await metas.tarefasDasMetas(sessao.db, ids));
  });
}

export function criarMeta(request: Request) {
  return tratar('criar o objetivo', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const nova = metas.validarNova(await lerJson(request));
    return Response.json(await metas.criar(sessao.db, sessao.usuario.id, nova), { status: 201 });
  });
}

export function atualizarMeta(request: Request, idTxt: string) {
  return tratar('salvar o objetivo', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const alteracao = metas.validarAlteracao(await lerJson(request), id);
    await metas.atualizar(sessao.db, sessao.usuario.id, id, alteracao);
    return new Response(null, { status: 204 });
  });
}

export function excluirMeta(idTxt: string) {
  return tratar('excluir o objetivo', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await metas.excluir(sessao.db, sessao.usuario.id, id);
    return new Response(null, { status: 204 });
  });
}
