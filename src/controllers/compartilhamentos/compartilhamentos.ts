import * as compartilhamentos from '@/src/models/compartilhamentos/compartilhamentos';
import { erro, exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

/** Painel "Compartilhamentos": suas pastas compartilhadas e as compartilhadas com você. */
export function resumoPastas() {
  return tratar('carregar os compartilhamentos', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const [queCompartilhei, comigo] = await Promise.all([
      compartilhamentos.pastasQueCompartilhei(sessao.db, sessao.usuario.id),
      compartilhamentos.pastasCompartilhadasComigo(sessao.db, sessao.usuario.id),
    ]);
    return Response.json({ queCompartilhei, comigo });
  });
}

export function listarUsuarios() {
  return tratar('carregar as pessoas', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await compartilhamentos.usuariosParaCompartilhar(sessao.db, sessao.usuario.id));
  });
}

export function listarAcessos(tipoTxt: string, idTxt: string) {
  return tratar('carregar os acessos', async () => {
    const tipo = compartilhamentos.validarTipo(tipoTxt);
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await compartilhamentos.listarAcessos(sessao.db, tipo, id));
  });
}

export function darAcesso(tipoTxt: string, idTxt: string, usuarioIdTxt: string) {
  return tratar('compartilhar', async () => {
    const tipo = compartilhamentos.validarTipo(tipoTxt);
    const id = idNumerico(idTxt);
    const usuarioId = compartilhamentos.validarUsuarioId(usuarioIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await compartilhamentos.compartilhar(sessao.db, tipo, id, usuarioId);
    return new Response(null, { status: 204 });
  });
}

export function removerAcesso(tipoTxt: string, idTxt: string, usuarioIdTxt: string) {
  return tratar('remover o compartilhamento', async () => {
    const tipo = compartilhamentos.validarTipo(tipoTxt);
    const id = idNumerico(idTxt);
    const usuarioId = compartilhamentos.validarUsuarioId(usuarioIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await compartilhamentos.descompartilhar(sessao.db, tipo, id, usuarioId);
    return new Response(null, { status: 204 });
  });
}

/** Só pasta tem responsável padrão. */
export function definirResponsavel(request: Request, tipoTxt: string, pastaIdTxt: string) {
  return tratar('definir o responsável da pasta', async () => {
    if (compartilhamentos.validarTipo(tipoTxt) !== 'pasta') return erro(404, 'Não encontrado.');
    const pastaId = idNumerico(pastaIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const { usuarioId } = await lerJson<{ usuarioId: unknown }>(request);
    const responsavel = usuarioId === null ? null : compartilhamentos.validarUsuarioId(usuarioId);
    await compartilhamentos.definirResponsavelPadrao(sessao.db, pastaId, responsavel);
    return new Response(null, { status: 204 });
  });
}
