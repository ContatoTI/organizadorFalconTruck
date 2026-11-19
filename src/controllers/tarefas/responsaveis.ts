import * as responsaveis from '@/src/models/tarefas/responsaveis';
import * as notificacoes from '@/src/models/notificacoes/notificacoes';
import { erro, exigirLogin, idNumerico, lerJson, nomeDoUsuario, tratar } from '../sessao';

export function listarResponsaveis(tarefaIdTxt: string) {
  return tratar('listar os responsáveis', async () => {
    const tarefaId = idNumerico(tarefaIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;

    const acesso = await responsaveis.acessoDaTarefa(sessao.db, tarefaId, sessao.usuario.id);
    if (!acesso) return erro(404, 'Tarefa não encontrada.');
    return Response.json(await responsaveis.listar(sessao.db, tarefaId));
  });
}

/** Troca a lista de responsáveis extras. Só o dono do projeto. Avisa quem entrou. */
export function definirResponsaveis(request: Request, tarefaIdTxt: string) {
  return tratar('salvar os responsáveis', async () => {
    const tarefaId = idNumerico(tarefaIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const { usuarioIds } = await lerJson<{ usuarioIds: unknown }>(request);
    const ids = responsaveis.validarIds(usuarioIds);

    const acesso = await responsaveis.acessoDaTarefa(sessao.db, tarefaId, sessao.usuario.id);
    if (!acesso) return erro(404, 'Tarefa não encontrada.');
    if (!acesso.ehDonoDoProjeto) return erro(403, 'Só o dono do projeto pode escolher os responsáveis.');

    // O principal já é responsável; não entra de novo na lista de extras.
    const extras = ids.filter(id => id !== acesso.principal);
    if (extras.length > responsaveis.vagasDeExtras(!!acesso.principal)) {
      return erro(400, `No máximo ${responsaveis.LIMITE_RESPONSAVEIS} pessoas por tarefa.`);
    }
    const entraram = await responsaveis.definir(sessao.db, tarefaId, extras);

    const remetente = nomeDoUsuario(sessao.usuario);
    for (const userId of entraram.filter(id => id !== sessao.usuario.id)) {
      // Aviso que falha não desfaz a gravação.
      await notificacoes.criarAviso(sessao.db, {
        userId, taskId: tarefaId, taskTitle: acesso.titulo, senderName: remetente, type: 'assigned', note: null,
      }).catch(e => console.error('[responsaveis] aviso não enviado:', e));
    }
    return Response.json(await responsaveis.listar(sessao.db, tarefaId));
  });
}
