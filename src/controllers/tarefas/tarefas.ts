import * as consultas from '@/src/models/tarefas/consultas';
import * as escrita from '@/src/models/tarefas/escrita';
import * as mover from '@/src/models/tarefas/mover';
import { ErroValidacao } from '@/src/lib/erros';
import { erro, exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const sucesso = () => new Response(null, { status: 204 });

const idOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || (v as number) <= 0) throw new ErroValidacao('Identificador inválido.');
  return v as number;
};

/** GET /api/tarefas?hoje=AAAA-MM-DD&projetoId=&pastaId=&grupoId=&soHoje=1&concluidas=1 */
export function listarTarefas(request: Request) {
  return tratar('carregar as tarefas', async () => {
    const busca = new URL(request.url).searchParams;
    const filtros: consultas.FiltrosTarefas = {
      hoje: consultas.validarHoje(busca.get('hoje')),
      concluidas: busca.get('concluidas') === '1',
      soHoje: busca.get('soHoje') === '1',
    };
    for (const [parametro, campo] of [['projetoId', 'projetoId'], ['pastaId', 'pastaId'], ['grupoId', 'grupoId']] as const) {
      const valor = busca.get(parametro);
      if (valor) filtros[campo] = idNumerico(valor);
    }
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await consultas.listar(sessao.db, sessao.usuario.id, filtros));
  });
}

export function buscarTarefa(request: Request, idTxt: string) {
  return tratar('carregar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const hoje = consultas.validarHoje(new URL(request.url).searchParams.get('hoje'));
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const tarefa = await consultas.buscar(sessao.db, id, hoje);
    return tarefa ? Response.json(tarefa) : erro(404, 'Tarefa não encontrada.');
  });
}

export function listarAguardando() {
  return tratar('carregar as tarefas delegadas', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await consultas.aguardando(sessao.db, sessao.usuario.id));
  });
}

export function criarTarefa(request: Request) {
  return tratar('criar a tarefa', async () => {
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const nova = escrita.validarNova(await lerJson(request));
    return Response.json(await escrita.criar(sessao.db, sessao.usuario.id, nova), { status: 201 });
  });
}

export function atualizarTarefa(request: Request, idTxt: string) {
  return tratar('salvar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await escrita.atualizar(sessao.db, id, escrita.validarAlteracao(await lerJson(request)));
    return sucesso();
  });
}

export function excluirTarefa(idTxt: string) {
  return tratar('excluir a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await escrita.excluir(sessao.db, sessao.usuario.id, id);
    return sucesso();
  });
}

export function concluirTarefa(request: Request, idTxt: string) {
  return tratar('concluir a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const { concluida } = await lerJson<{ concluida: unknown }>(request);
    if (typeof concluida !== 'boolean') return erro(400, 'Estado inválido.');
    await escrita.concluir(sessao.db, id, concluida);
    return sucesso();
  });
}

export function adiarTarefa(request: Request, idTxt: string) {
  return tratar('adiar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const corpo = await lerJson<{ horizonte: unknown; planDate: unknown }>(request);
    if (corpo.horizonte === null) {
      await escrita.adiar(sessao.db, id, null, null);
    } else {
      const horizonte = escrita.validarHorizonte(corpo.horizonte);
      if (typeof corpo.planDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(corpo.planDate)) {
        return erro(400, 'Data do adiamento inválida.');
      }
      await escrita.adiar(sessao.db, id, horizonte, corpo.planDate);
    }
    return sucesso();
  });
}

export function delegarTarefa(request: Request, idTxt: string) {
  return tratar('delegar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const { responsavelId } = await lerJson<{ responsavelId: unknown }>(request);
    if (responsavelId !== null && typeof responsavelId !== 'string') return erro(400, 'Responsável inválido.');
    await escrita.delegar(sessao.db, id, responsavelId as string | null);
    return sucesso();
  });
}

export function repetirTarefa(request: Request, idTxt: string) {
  return tratar('salvar a repetição', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await escrita.repetir(sessao.db, id, escrita.validarRepeticao(await lerJson(request)));
    return sucesso();
  });
}

/** PATCH { destino: 'grupo', grupoId } ou { destino: 'projeto', projetoId, pastaId }. */
export function moverTarefa(request: Request, idTxt: string) {
  return tratar('mover a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const corpo = await lerJson<{ destino: unknown; grupoId?: unknown; projetoId?: unknown; pastaId?: unknown }>(request);
    if (corpo.destino === 'grupo') {
      await mover.paraGrupo(sessao.db, id, idOuNulo(corpo.grupoId));
    } else if (corpo.destino === 'projeto') {
      await mover.paraProjeto(sessao.db, id, idOuNulo(corpo.projetoId), idOuNulo(corpo.pastaId));
    } else {
      return erro(400, 'Destino inválido.');
    }
    return sucesso();
  });
}

/** POST { pastaId, indice, projetoId, grupoId } — arrastar e soltar com reordenação. */
export function reordenarTarefa(request: Request, idTxt: string) {
  return tratar('reordenar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const corpo = await lerJson<{ pastaId?: unknown; indice: unknown; projetoId?: unknown; grupoId?: unknown }>(request);
    if (!Number.isInteger(corpo.indice) || (corpo.indice as number) < 0) return erro(400, 'Posição inválida.');
    await mover.reordenar(
      sessao.db, id,
      idOuNulo(corpo.pastaId), corpo.indice as number,
      idOuNulo(corpo.projetoId), idOuNulo(corpo.grupoId),
    );
    return sucesso();
  });
}

export function listarGruposDaTarefa(idTxt: string) {
  return tratar('carregar os grupos da tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await mover.gruposVinculados(sessao.db, id));
  });
}

export function vincularGrupo(idTxt: string, grupoIdTxt: string) {
  return tratar('vincular a tarefa ao grupo', async () => {
    const id = idNumerico(idTxt);
    const grupoId = idNumerico(grupoIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await mover.vincularAoGrupo(sessao.db, id, grupoId);
    return sucesso();
  });
}

/** DELETE; com ?direto=1 limpa também o campo view_group_id da tarefa. */
export function desvincularGrupo(request: Request, idTxt: string, grupoIdTxt: string) {
  return tratar('tirar a tarefa do grupo', async () => {
    const id = idNumerico(idTxt);
    const grupoId = idNumerico(grupoIdTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const direto = new URL(request.url).searchParams.get('direto') === '1';
    if (direto) await mover.removerDoGrupo(sessao.db, id, grupoId);
    else await mover.desvincularDoGrupo(sessao.db, id, grupoId);
    return sucesso();
  });
}
