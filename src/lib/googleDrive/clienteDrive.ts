import { createSign } from 'node:crypto';
import type { Armazenamento } from '@/src/models/tarefas/anexos';

// Cliente do Google Drive (REST v3) com conta de serviço. Sem regra de negócio.

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TIPO_PASTA = 'application/vnd.google-apps.folder';
// Compatível com Drive compartilhado (conta de serviço não tem cota no "Meu Drive").
const DRIVES = 'supportsAllDrives=true';

export interface ConfigDrive {
  email: string;
  chavePrivada: string;
  pastaRaizId: string;
}

export function lerConfigDoAmbiente(): ConfigDrive {
  const faltando = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_DRIVE_PASTA_RAIZ_ID']
    .filter((nome) => !process.env[nome]);
  if (faltando.length) throw new Error(`Google Drive não configurado. Falta no .env: ${faltando.join(', ')}`);
  return {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    chavePrivada: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    pastaRaizId: process.env.GOOGLE_DRIVE_PASTA_RAIZ_ID!,
  };
}

const base64url = (dados: string | Buffer) => Buffer.from(dados).toString('base64url');

let tokenEmCache: { valor: string; expiraEm: number; email: string } | null = null;

async function obterToken(config: ConfigDrive): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  if (tokenEmCache && tokenEmCache.email === config.email && tokenEmCache.expiraEm - 60 > agora) {
    return tokenEmCache.valor;
  }

  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify({
    iss: config.email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));
  const assinatura = createSign('RSA-SHA256').update(`${cabecalho}.${corpo}`).sign(config.chavePrivada);
  const jwt = `${cabecalho}.${corpo}.${base64url(assinatura)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const json = await lerResposta<{ access_token: string; expires_in: number }>(resp, 'autenticar no Google');
  tokenEmCache = { valor: json.access_token, expiraEm: agora + json.expires_in, email: config.email };
  return json.access_token;
}

async function lerResposta<T>(resp: Response, acao: string): Promise<T> {
  if (!resp.ok) throw new Error(`Drive: falha ao ${acao} (${resp.status}): ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

const escaparConsulta = (texto: string) => texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function criarArmazenamentoDrive(config: ConfigDrive = lerConfigDoAmbiente()): Armazenamento {
  const chamar = async (url: string, init: RequestInit = {}) => {
    const token = await obterToken(config);
    return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  };

  async function pastaFilha(paiId: string, nome: string): Promise<string> {
    const q = `name='${escaparConsulta(nome)}' and '${paiId}' in parents and mimeType='${TIPO_PASTA}' and trashed=false`;
    const busca = await lerResposta<{ files: { id: string }[] }>(
      await chamar(`${API}?${DRIVES}&includeItemsFromAllDrives=true&fields=files(id)&q=${encodeURIComponent(q)}`),
      'buscar pasta',
    );
    if (busca.files.length) return busca.files[0].id;

    const criada = await lerResposta<{ id: string }>(
      await chamar(`${API}?${DRIVES}&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, mimeType: TIPO_PASTA, parents: [paiId] }),
      }),
      'criar pasta',
    );
    return criada.id;
  }

  return {
    async garantirPasta(caminho) {
      let atual = config.pastaRaizId;
      for (const nome of caminho) atual = await pastaFilha(atual, nome);
      return atual;
    },

    async enviar(pastaId, nome, mime, dados) {
      const limite = `limite${crypto.randomUUID()}`;
      const metadados = JSON.stringify({ name: nome, parents: [pastaId] });
      const corpo = Buffer.concat([
        Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadados}\r\n`),
        Buffer.from(`--${limite}\r\nContent-Type: ${mime}\r\n\r\n`),
        Buffer.from(dados),
        Buffer.from(`\r\n--${limite}--`),
      ]);
      const criado = await lerResposta<{ id: string }>(
        await chamar(`${UPLOAD}?uploadType=multipart&${DRIVES}&fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
          body: corpo,
        }),
        'enviar arquivo',
      );
      return criado.id;
    },

    async baixar(arquivoId) {
      const resp = await chamar(`${API}/${encodeURIComponent(arquivoId)}?alt=media&${DRIVES}`);
      if (!resp.ok) throw new Error(`Drive: falha ao baixar arquivo (${resp.status})`);
      return new Uint8Array(await resp.arrayBuffer());
    },

    async enviarParaLixeira(arquivoId) {
      await lerResposta(
        await chamar(`${API}/${encodeURIComponent(arquivoId)}?${DRIVES}&fields=id`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        }),
        'mandar para a lixeira',
      );
    },
  };
}
