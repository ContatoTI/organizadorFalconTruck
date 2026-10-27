import * as notificacoes from '@/src/models/notificacoes/notificacoes';
import { exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const sucesso = () => new Response(null, { status: 204 });

/** Convites pendentes para você e recusas nos seus projetos. */
export function listarConvites() {
  return tratar('carregar os convites', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await notificacoes.convitesERecusas(sessao.db, sessao.usuario.id));
  });
}

/** Avisos de tarefa ainda não lidos. */
export function listarAvisos() {
  return tratar('carregar os avisos', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await notificacoes.avisosNaoLidos(sessao.db, sessao.usuario.id));
  });
}

export function aceitarConvite(idTxt: string) {
  return tratar('aceitar o convite', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await notificacoes.aceitarConvite(sessao.db, sessao.usuario.id, id);
    return sucesso();
  });
}

export function recusarConvite(idTxt: string) {
  return tratar('recusar o convite', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await notificacoes.recusarConvite(sessao.db, sessao.usuario.id, id);
    return sucesso();
  });
}

export function criarAviso(request: Request) {
  return tratar('enviar o aviso', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await notificacoes.criarAviso(sessao.db, notificacoes.validarNovoAviso(await lerJson(request)));
    return new Response(null, { status: 201 });
  });
}

export function dispensarAviso(idTxt: string) {
  return tratar('dispensar o aviso', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await notificacoes.dispensarAviso(sessao.db, sessao.usuario.id, id);
    return sucesso();
  });
}

export function resolverRevisao(request: Request, idTxt: string) {
  return tratar('resolver a revisão', async () => {
    const avisoId = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const corpo = await lerJson<{ taskId: unknown; approve: unknown; reviewerName: unknown; note?: unknown }>(request);
    const tarefaId = idNumerico(String(corpo.taskId));
    const nome = typeof corpo.reviewerName === 'string' ? corpo.reviewerName : '';
    const nota = typeof corpo.note === 'string' ? corpo.note : null;
    await notificacoes.resolverRevisao(
      sessao.db, { id: sessao.usuario.id, nome }, avisoId, tarefaId, corpo.approve === true, nota,
    );
    return sucesso();
  });
}
