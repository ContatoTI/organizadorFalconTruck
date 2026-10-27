import * as grupos from '@/src/models/grupos/grupos';
import { erro, exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const ORDENS: readonly grupos.OrdemGrupos[] = ['created_at', 'title'];

export function listarGrupos(request: Request) {
  return tratar('carregar os grupos', async () => {
    const ordem = (new URL(request.url).searchParams.get('ordem') ?? 'created_at') as grupos.OrdemGrupos;
    if (!ORDENS.includes(ordem)) return erro(400, 'Ordem inválida.');
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await grupos.listar(sessao.db, sessao.usuario.id, ordem));
  });
}

export function criarGrupo(request: Request) {
  return tratar('criar o grupo', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const dados = grupos.validarDados(await lerJson(request), true);
    return Response.json(await grupos.criar(sessao.db, sessao.usuario.id, dados), { status: 201 });
  });
}

export function atualizarGrupo(request: Request, idTxt: string) {
  return tratar('salvar o grupo', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const dados = grupos.validarDados(await lerJson(request));
    await grupos.atualizar(sessao.db, sessao.usuario.id, id, dados);
    return new Response(null, { status: 204 });
  });
}

export function excluirGrupo(idTxt: string) {
  return tratar('excluir o grupo', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await grupos.excluir(sessao.db, sessao.usuario.id, id);
    return new Response(null, { status: 204 });
  });
}
