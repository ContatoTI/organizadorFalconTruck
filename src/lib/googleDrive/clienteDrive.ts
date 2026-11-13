import type { Armazenamento } from '@/src/models/tarefas/anexos';

// Cliente do Google Drive (REST v3) com OAuth (refresh token de uma conta Google). Sem regra de negócio.

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TIPO_PASTA = 'application/vnd.google-apps.folder';
// Funciona no "Meu Drive" e também em Drive compartilhado.
const DRIVES = 'supportsAllDrives=true';

export interface ConfigDrive {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  pastaRaizId: string;
}

const VARIAVEIS = {
  clientId: 'GOOGLE_OAUTH_CLIENT_ID',
  clientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
  refreshToken: 'GOOGLE_OAUTH_REFRESH_TOKEN',
  pastaRaizId: 'GOOGLE_DRIVE_PASTA_RAIZ_ID',
} as const;

export function lerConfigDoAmbiente(): ConfigDrive {
  const faltando = Object.values(VARIAVEIS).filter((nome) => !process.env[nome]?.trim());
  if (faltando.length) throw new Error(`Google Drive não configurado. Falta no .env: ${faltando.join(', ')}`);
  const ler = (nome: string) => process.env[nome]!.trim();
  return {
    clientId: ler(VARIAVEIS.clientId),
    clientSecret: ler(VARIAVEIS.clientSecret),
    refreshToken: ler(VARIAVEIS.refreshToken),
    pastaRaizId: ler(VARIAVEIS.pastaRaizId),
  };
}

let tokenEmCache: { valor: string; expiraEm: number; refreshToken: string } | null = null;

async function obterToken(config: ConfigDrive): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  if (tokenEmCache && tokenEmCache.refreshToken === config.refreshToken && tokenEmCache.expiraEm - 60 > agora) {
    return tokenEmCache.valor;
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });
  const json = await lerResposta<{ access_token: string; expires_in: number }>(resp, 'autenticar no Google');
  tokenEmCache = { valor: json.access_token, expiraEm: agora + json.expires_in, refreshToken: config.refreshToken };
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

    async baixar(arquivoId, faixa) {
      const resp = await chamar(`${API}/${encodeURIComponent(arquivoId)}?alt=media&${DRIVES}`,
        faixa ? { headers: { Range: faixa } } : {});
      if (!resp.ok) throw new Error(`Drive: falha ao baixar arquivo (${resp.status})`);
      return {
        dados: new Uint8Array(await resp.arrayBuffer()),
        trecho: resp.status === 206 ? resp.headers.get('Content-Range') : null,
      };
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
