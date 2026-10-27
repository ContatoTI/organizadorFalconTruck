import * as agenda from '@/src/models/calendario/agenda';
import { exigirLogin, idNumerico, lerJson, tratar } from '../sessao';

const sucesso = () => new Response(null, { status: 204 });

export function agendarTarefa(request: Request, idTxt: string) {
  return tratar('agendar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    await agenda.agendar(sessao.db, id, agenda.validarHorario(await lerJson(request)));
    return sucesso();
  });
}

export function agendarDiaInteiro(request: Request, idTxt: string) {
  return tratar('agendar a tarefa', async () => {
    const id = idNumerico(idTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const { dueDate } = await lerJson<{ dueDate: unknown }>(request);
    await agenda.agendarDiaInteiro(sessao.db, id, agenda.validarData(dueDate));
    return sucesso();
  });
}

/** GET /api/calendario/ocorrencias?de=AAAA-MM-DD&ate=AAAA-MM-DD */
export function listarOcorrencias(request: Request) {
  return tratar('carregar as repetições', async () => {
    const busca = new URL(request.url).searchParams;
    const de = agenda.validarData(busca.get('de'), 'Data inicial');
    const ate = agenda.validarData(busca.get('ate'), 'Data final');
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    return Response.json(await agenda.ocorrencias(sessao.db, sessao.usuario.id, de, ate));
  });
}

export function marcarOcorrencia(request: Request, tarefaIdTxt: string, dataTxt: string) {
  return tratar('marcar a repetição', async () => {
    const tarefaId = idNumerico(tarefaIdTxt);
    const data = agenda.validarData(dataTxt);
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const estado = agenda.validarEstado(await lerJson(request));
    await agenda.marcarOcorrencia(sessao.db, sessao.usuario.id, tarefaId, data, estado);
    return sucesso();
  });
}
