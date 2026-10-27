import * as lancamentos from '@/src/models/financas/lancamentos';
import { erro, exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

export function listarLancamentos() {
  return tratar('carregar as transações', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await lancamentos.listar(sessao.db, sessao.usuario.id));
  });
}

export function criarLancamento(request: Request) {
  return tratar('salvar a transação', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const dados = lancamentos.validarLancamento(await lerJson(request));
    return Response.json(await lancamentos.criar(sessao.db, sessao.usuario.id, dados), { status: 201 });
  });
}

export function atualizarLancamento(request: Request, idTxt: string) {
  return tratar('salvar a transação', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const dados = lancamentos.validarLancamento(await lerJson(request));
    const atualizado = await lancamentos.atualizar(sessao.db, sessao.usuario.id, id, dados);
    return atualizado ? Response.json(atualizado) : erro(404, 'Transação não encontrada.');
  });
}

export function excluirLancamento(idTxt: string) {
  return tratar('excluir a transação', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await lancamentos.excluir(sessao.db, sessao.usuario.id, id);
    return new Response(null, { status: 204 });
  });
}
