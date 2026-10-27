import * as habitos from '@/src/models/habitos/habitos';
import { erro, exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const DIAS_MAX = 400;

export function listarHabitos() {
  return tratar('carregar os hábitos', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await habitos.listar(sessao.db, sessao.usuario.id));
  });
}

export function listarMarcacoes(request: Request) {
  return tratar('carregar as marcações', async () => {
    const dias = Number(new URL(request.url).searchParams.get('dias') ?? 120);
    if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX) return erro(400, 'Período inválido.');
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await habitos.marcacoesRecentes(sessao.db, sessao.usuario.id, dias));
  });
}

export function criarHabito(request: Request) {
  return tratar('criar o hábito', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const novo = habitos.validarNovo(await lerJson(request));
    return Response.json(await habitos.criar(sessao.db, sessao.usuario.id, novo), { status: 201 });
  });
}

export function atualizarHabito(request: Request, idTxt: string) {
  return tratar('salvar o hábito', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const alteracao = habitos.validarAlteracao(await lerJson(request));
    await habitos.atualizar(sessao.db, sessao.usuario.id, id, alteracao);
    return new Response(null, { status: 204 });
  });
}

export function excluirHabito(idTxt: string) {
  return tratar('excluir o hábito', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await habitos.excluir(sessao.db, sessao.usuario.id, id);
    return new Response(null, { status: 204 });
  });
}

export function marcarDia(idTxt: string, dia: string) {
  return tratar('marcar o hábito', async () => {
    const id = idNumerico(idTxt);
    habitos.validarDia(dia);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await habitos.marcar(sessao.db, sessao.usuario.id, id, dia);
    return new Response(null, { status: 204 });
  });
}

export function desmarcarDia(idTxt: string, dia: string) {
  return tratar('desmarcar o hábito', async () => {
    const id = idNumerico(idTxt);
    habitos.validarDia(dia);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await habitos.desmarcar(sessao.db, sessao.usuario.id, id, dia);
    return new Response(null, { status: 204 });
  });
}
