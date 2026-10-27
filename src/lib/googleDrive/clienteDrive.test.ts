import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { criarArmazenamentoDrive, lerConfigDoAmbiente, type ConfigDrive } from './clienteDrive';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config: ConfigDrive = {
  email: 'conta@teste.iam.gserviceaccount.com',
  chavePrivada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
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
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '');
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '');
    vi.stubEnv('GOOGLE_DRIVE_PASTA_RAIZ_ID', 'x');
    expect(() => lerConfigDoAmbiente()).toThrow('GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
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
