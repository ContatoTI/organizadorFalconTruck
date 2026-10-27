import type { SupabaseClient } from '@supabase/supabase-js';
import { criarArmazenamentoDrive } from '@/src/lib/googleDrive/clienteDrive';
import * as anexos from '@/src/models/tarefas/anexos';
import { erro, exigirLogin, idNumerico, tratar } from '../sessao';

type Acesso = { db: SupabaseClient; tarefaId: number };

/** Login + permissão: só segue se o usuário enxerga a tarefa. */
async function prepararAcesso(tarefaIdTxt: string): Promise<Acesso | Response> {
  const tarefaId = idNumerico(tarefaIdTxt);
  const sessao = await exigirLogin();
  if (sessao instanceof Response) return sessao;

  if (!(await anexos.tarefaVisivel(sessao.db, tarefaId))) return erro(404, 'Tarefa não encontrada.');
  return { db: sessao.db, tarefaId };
}

export function listarAnexos(tarefaIdTxt: string) {
  return tratar('listar os anexos', async () => {
    const acesso = await prepararAcesso(tarefaIdTxt);
    if (acesso instanceof Response) return acesso;
    return Response.json(await anexos.listar(acesso.db, acesso.tarefaId));
  });
}

export function enviarAnexo(request: Request, tarefaIdTxt: string) {
  return tratar('enviar o anexo', async () => {
    const acesso = await prepararAcesso(tarefaIdTxt);
    if (acesso instanceof Response) return acesso;

    const arquivo = (await request.formData()).get('arquivo');
    if (!(arquivo instanceof File)) return erro(400, 'Nenhum arquivo enviado.');

    const recebido = { nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size };
    const invalido = anexos.validarArquivo(recebido);
    if (invalido) return erro(400, invalido);

    const dados = new Uint8Array(await arquivo.arrayBuffer());
    const anexo = await anexos.enviar(acesso.db, criarArmazenamentoDrive(), acesso.tarefaId, { ...recebido, dados });
    return Response.json(anexo, { status: 201 });
  });
}

export function excluirAnexo(tarefaIdTxt: string, anexoId: string) {
  return tratar('excluir o anexo', async () => {
    const acesso = await prepararAcesso(tarefaIdTxt);
    if (acesso instanceof Response) return acesso;

    const anexo = await anexos.buscar(acesso.db, acesso.tarefaId, anexoId);
    if (!anexo) return erro(404, 'Anexo não encontrado.');

    await anexos.excluir(acesso.db, criarArmazenamentoDrive(), anexo);
    return new Response(null, { status: 204 });
  });
}

/** Proxy da imagem: o arquivo no Drive nunca fica público. */
export function verAnexo(tarefaIdTxt: string, anexoId: string) {
  return tratar('abrir o anexo', async () => {
    const acesso = await prepararAcesso(tarefaIdTxt);
    if (acesso instanceof Response) return acesso;

    const anexo = await anexos.buscar(acesso.db, acesso.tarefaId, anexoId);
    if (!anexo) return erro(404, 'Anexo não encontrado.');

    const dados = await criarArmazenamentoDrive().baixar(anexo.drive_file_id);
    return new Response(dados as BodyInit, {
      headers: {
        'Content-Type': anexo.mime,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
