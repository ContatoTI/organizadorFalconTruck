import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarArmazenamentoDrive, lerConfigDoAmbiente, type ConfigDrive } from './clienteDrive';

const config: ConfigDrive = {
  clientId: 'cliente',
  clientSecret: 'segredo',
  refreshToken: 'refresh-teste',
  pastaRaizId: 'raiz',
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

/** Responde o token e depois cada chamada ao Drive na ordem dada. */
function fetchFalso(...respostas: Response[]) {
  const fila = [...respostas];
  const fn = vi.fn(async (url: string | URL, _init?: RequestInit) =>
    String(url).includes('oauth2') ? json({ access_token: 'tk', expires_in: 3600 }) : fila.shift()!);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const chamadasDrive = (fn: ReturnType<typeof fetchFalso>) =>
  fn.mock.calls.filter(([url]) => !String(url).includes('oauth2'));

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllEnvs());

describe('lerConfigDoAmbiente', () => {
  it('falha avisando as variáveis que faltam', () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'id');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '');
    vi.stubEnv('GOOGLE_OAUTH_REFRESH_TOKEN', '  ');
    vi.stubEnv('GOOGLE_DRIVE_PASTA_RAIZ_ID', 'x');
    expect(() => lerConfigDoAmbiente()).toThrow('GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN');
  });

  it('lê as variáveis sem espaços sobrando', () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', ' id ');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'seg');
    vi.stubEnv('GOOGLE_OAUTH_REFRESH_TOKEN', 'rt');
    vi.stubEnv('GOOGLE_DRIVE_PASTA_RAIZ_ID', 'pasta');
    expect(lerConfigDoAmbiente()).toEqual({ clientId: 'id', clientSecret: 'seg', refreshToken: 'rt', pastaRaizId: 'pasta' });
  });
});

describe('autenticação', () => {
  it('troca o refresh token por um access token', async () => {
    const fn = fetchFalso(json({ id: 'arq-1' }));
    await criarArmazenamentoDrive({ ...config, refreshToken: 'outro-refresh' }).enviarParaLixeira('arq-1');
    const [url, init] = fn.mock.calls.find(([u]) => String(u).includes('oauth2'))!;
    expect(String(url)).toBe('https://oauth2.googleapis.com/token');
    const corpo = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(corpo)).toEqual({
      grant_type: 'refresh_token', client_id: 'cliente', client_secret: 'segredo', refresh_token: 'outro-refresh',
    });
  });
});

describe('garantirPasta', () => {
  it('reusa pasta existente e cria a que falta', async () => {
    const fn = fetchFalso(json({ files: [{ id: 'p-tarefas' }] }), json({ files: [] }), json({ id: 'p-42' }));
    const id = await criarArmazenamentoDrive(config).garantirPasta(['Tarefas', '42']);

    expect(id).toBe('p-42');
    const chamadas = chamadasDrive(fn);
    expect(decodeURIComponent(String(chamadas[0][0]))).toContain("'raiz' in parents");
    expect(JSON.parse(String(chamadas[2][1]?.body))).toMatchObject({ name: '42', parents: ['p-tarefas'] });
    expect((chamadas[2][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tk');
  });
});

describe('arquivos', () => {
  it('envia arquivo e devolve o id', async () => {
    const fn = fetchFalso(json({ id: 'arq-1' }));
    await expect(criarArmazenamentoDrive(config).enviar('p', 'a.png', 'image/png', new Uint8Array([1]))).resolves.toBe('arq-1');
    expect(String(chamadasDrive(fn)[0][0])).toContain('uploadType=multipart');
  });

  it('manda para a lixeira (não apaga)', async () => {
    const fn = fetchFalso(json({ id: 'arq-1' }));
    await criarArmazenamentoDrive(config).enviarParaLixeira('arq-1');
    const [, init] = chamadasDrive(fn)[0];
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ trashed: true });
  });

  it('erro do Drive vira exceção clara', async () => {
    fetchFalso(new Response('sem permissão', { status: 403 }));
    await expect(criarArmazenamentoDrive(config).enviar('p', 'a.png', 'image/png', new Uint8Array([1])))
      .rejects.toThrow(/falha ao enviar arquivo \(403\)/);
  });
});
