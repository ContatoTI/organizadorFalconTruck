import * as pastas from '@/src/models/projetos/pastas';
import { exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const sucesso = () => new Response(null, { status: 204 });

export function listarPastas(projetoIdTxt: string) {
  return tratar('carregar as pastas', async () => {
    const projetoId = idNumerico(projetoIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await pastas.listar(sessao.db, projetoId));
  });
}

export function criarPasta(request: Request, projetoIdTxt: string) {
  return tratar('criar a pasta', async () => {
    const projetoId = idNumerico(projetoIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const nova = pastas.validarNova(await lerJson(request));
    return Response.json(await pastas.criar(sessao.db, sessao.usuario.id, projetoId, nova), { status: 201 });
  });
}

export function atualizarPasta(request: Request, idTxt: string) {
  return tratar('salvar a pasta', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await pastas.atualizar(sessao.db, id, pastas.validarAlteracao(await lerJson(request)));
    return sucesso();
  });
}

export function excluirPasta(idTxt: string) {
  return tratar('excluir a pasta', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await pastas.excluir(sessao.db, id);
    return sucesso();
  });
}

/** PATCH { indice } — muda a posição; PATCH { projetoId } — move para outro projeto. */
export function moverPasta(request: Request, idTxt: string) {
  return tratar('mover a pasta', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const corpo = await lerJson<{ indice?: unknown; projetoId?: unknown }>(request);
    if (corpo.projetoId !== undefined) {
      await pastas.moverParaProjeto(sessao.db, id, idNumerico(String(corpo.projetoId)));
    } else {
      await pastas.reordenar(sessao.db, id, pastas.validarIndice(corpo.indice));
    }
    return sucesso();
  });
}
