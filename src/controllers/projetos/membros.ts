import * as membros from '@/src/models/projetos/membros';
import { validarUsuarioId } from '@/src/models/compartilhamentos/compartilhamentos';
import { exigirLogin, idNumerico, tratar } from '../sessao';

const sucesso = () => new Response(null, { status: 204 });

/** Membros e convites pendentes do projeto (para a janela de compartilhar). */
export function listarMembros(idTxt: string) {
  return tratar('carregar os membros', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const [lista, pendentes] = await Promise.all([
      membros.listarMembros(sessao.db, id),
      membros.convitesPendentes(sessao.db, id),
    ]);
    return Response.json({ membros: lista, pendentes });
  });
}

export function removerMembro(idTxt: string, usuarioIdTxt: string) {
  return tratar('remover o membro', async () => {
    const id = idNumerico(idTxt);
    const usuarioId = validarUsuarioId(usuarioIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await membros.removerMembro(sessao.db, id, usuarioId, sessao.usuario.id);
    return sucesso();
  });
}

export function convidar(idTxt: string, usuarioIdTxt: string) {
  return tratar('convidar', async () => {
    const id = idNumerico(idTxt);
    const usuarioId = validarUsuarioId(usuarioIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await membros.convidar(sessao.db, id, usuarioId, sessao.usuario.id);
    return new Response(null, { status: 201 });
  });
}

export function cancelarConvite(idTxt: string, usuarioIdTxt: string) {
  return tratar('cancelar o convite', async () => {
    const id = idNumerico(idTxt);
    const usuarioId = validarUsuarioId(usuarioIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await membros.cancelarConvitePendente(sessao.db, id, usuarioId);
    return sucesso();
  });
}

export function reconvidar(idTxt: string, usuarioIdTxt: string) {
  return tratar('convidar de novo', async () => {
    const id = idNumerico(idTxt);
    const usuarioId = validarUsuarioId(usuarioIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await membros.reconvidar(sessao.db, id, usuarioId, sessao.usuario.id);
    return new Response(null, { status: 201 });
  });
}

export function apagarRecusa(conviteIdTxt: string) {
  return tratar('apagar o aviso de recusa', async () => {
    const conviteId = idNumerico(conviteIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await membros.apagarConviteRecusado(sessao.db, conviteId);
    return sucesso();
  });
}
