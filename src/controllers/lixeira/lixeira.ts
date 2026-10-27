import * as lixeira from '@/src/models/lixeira/lixeira';
import { erro, exigirLogin, idNumerico, tratar } from '../sessao';

export function listarLixeira() {
  return tratar('carregar a lixeira', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await lixeira.listar(sessao.db));
  });
}

export function restaurarTarefa(idTxt: string) {
  return tratar('restaurar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return (await lixeira.restaurar(sessao.db, id))
      ? new Response(null, { status: 204 })
      : erro(404, 'Tarefa não encontrada na lixeira.');
  });
}

export function excluirDefinitivo(idTxt: string) {
  return tratar('excluir a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return (await lixeira.excluirDeVez(sessao.db, id))
      ? new Response(null, { status: 204 })
      : erro(404, 'Tarefa não encontrada na lixeira.');
  });
}
