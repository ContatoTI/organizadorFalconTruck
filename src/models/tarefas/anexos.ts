import type { SupabaseClient } from '@supabase/supabase-js';
import { ErroValidacao } from '@/src/lib/erros';
import { CONFIG_ANEXOS, ehVideo } from './configAnexos';

export { ErroValidacao };

export interface Anexo {
  id: string;
  tarefa_id: number;
  drive_file_id: string;
  nome: string;
  mime: string;
  tamanho: number;
  criado_por: string;
  criado_em: string;
}

export interface ArquivoRecebido {
  nome: string;
  mime: string;
  tamanho: number;
}

/** Arquivo baixado. `trecho` = Content-Range quando foi pedido só um pedaço (vídeo). */
export interface ArquivoBaixado {
  dados: Uint8Array;
  trecho: string | null;
}

/** Onde os arquivos ficam guardados (Google Drive em produção). */
export interface Armazenamento {
  garantirPasta(caminho: string[]): Promise<string>;
  enviar(pastaId: string, nome: string, mime: string, dados: Uint8Array): Promise<string>;
  /** `faixa` = cabeçalho Range do navegador (ex.: "bytes=0-1023"); o player de vídeo precisa disso. */
  baixar(arquivoId: string, faixa?: string | null): Promise<ArquivoBaixado>;
  enviarParaLixeira(arquivoId: string): Promise<void>;
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const COLUNAS = 'id, tarefa_id, drive_file_id, nome, mime, tamanho, criado_por, criado_em';

/** Retorna a mensagem de erro, ou null se o arquivo é aceito. */
export function validarArquivo(arquivo: ArquivoRecebido): string | null {
  if (!(CONFIG_ANEXOS.tiposAceitos as readonly string[]).includes(arquivo.mime)) {
    return `"${arquivo.nome}": tipo não aceito. Use imagem (PNG, JPG, WEBP, GIF) ou vídeo (MP4, MOV, WEBM).`;
  }
  if (arquivo.tamanho <= 0) {
    return `"${arquivo.nome}": arquivo vazio.`;
  }
  const limiteMb = ehVideo(arquivo.mime) ? CONFIG_ANEXOS.tamanhoMaxMbVideo : CONFIG_ANEXOS.tamanhoMaxMbImagem;
  if (arquivo.tamanho > limiteMb * 1024 * 1024) {
    return `"${arquivo.nome}": maior que ${limiteMb} MB.`;
  }
  return null;
}

/** Nome para imagem colada sem nome: colado-AAAAMMDD-HHMMSS.png */
export function nomeColado(mime: string, agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}`;
  const hora = `${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`;
  return `colado-${data}-${hora}.${EXTENSAO_POR_MIME[mime] ?? 'png'}`;
}

export function nomeFinal(nome: string, mime: string): string {
  const limpo = nome.trim();
  return limpo ? limpo : nomeColado(mime);
}

export function caminhoPasta(tarefaId: number): string[] {
  return [CONFIG_ANEXOS.pastaTarefas, String(tarefaId)];
}

/** A RLS de todos decide: só retorna a tarefa se o usuário puder vê-la. */
export async function tarefaVisivel(db: SupabaseClient, tarefaId: number): Promise<boolean> {
  const { data, error } = await db.from('todos').select('id').eq('id', tarefaId).maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

export async function listar(db: SupabaseClient, tarefaId: number): Promise<Anexo[]> {
  const { data, error } = await db
    .from('tarefa_anexos')
    .select(COLUNAS)
    .eq('tarefa_id', tarefaId)
    .is('excluido_em', null)
    .order('criado_em', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Anexo[];
}

export async function buscar(db: SupabaseClient, tarefaId: number, anexoId: string): Promise<Anexo | null> {
  const { data, error } = await db
    .from('tarefa_anexos')
    .select(COLUNAS)
    .eq('id', anexoId)
    .eq('tarefa_id', tarefaId)
    .is('excluido_em', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Anexo | null;
}

export async function enviar(
  db: SupabaseClient,
  armazenamento: Armazenamento,
  tarefaId: number,
  arquivo: ArquivoRecebido & { dados: Uint8Array },
): Promise<Anexo> {
  const erro = validarArquivo(arquivo);
  if (erro) throw new ErroValidacao(erro);

  const nome = nomeFinal(arquivo.nome, arquivo.mime);
  const pastaId = await armazenamento.garantirPasta(caminhoPasta(tarefaId));
  const driveFileId = await armazenamento.enviar(pastaId, nome, arquivo.mime, arquivo.dados);

  const { data, error } = await db
    .from('tarefa_anexos')
    .insert({ tarefa_id: tarefaId, drive_file_id: driveFileId, nome, mime: arquivo.mime, tamanho: arquivo.tamanho })
    .select(COLUNAS)
    .single();
  if (error) {
    // Sem vínculo no banco o arquivo ficaria órfão no Drive.
    await armazenamento.enviarParaLixeira(driveFileId).catch(() => {});
    throw new Error(error.message);
  }
  return data as Anexo;
}

export async function excluir(db: SupabaseClient, armazenamento: Armazenamento, anexo: Anexo): Promise<void> {
  const { error } = await db
    .from('tarefa_anexos')
    .update({ excluido_em: new Date().toISOString() })
    .eq('id', anexo.id);
  if (error) throw new Error(error.message);
  await armazenamento.enviarParaLixeira(anexo.drive_file_id);
}
