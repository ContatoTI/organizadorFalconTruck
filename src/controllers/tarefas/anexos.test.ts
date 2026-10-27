import { describe, it, expect, vi, beforeEach } from 'vitest';

const usuario = { current: { id: 'u1' } as { id: string } | null };
vi.mock('@/src/lib/supabase/Server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario.current } }) } }),
}));

const drive = { baixar: vi.fn(async () => new Uint8Array([7, 7])) };
vi.mock('@/src/lib/googleDrive/clienteDrive', () => ({ criarArmazenamentoDrive: () => drive }));

vi.mock('@/src/models/tarefas/anexos', async (original) => {
  const real = await original<typeof import('@/src/models/tarefas/anexos')>();
  return {
    ...real,
    tarefaVisivel: vi.fn(async () => true),
    listar: vi.fn(async () => [{ id: 'a1' }]),
    buscar: vi.fn(async () => ({ id: 'a1', drive_file_id: 'f1', mime: 'image/png', nome: 'a.png' })),
    enviar: vi.fn(async () => ({ id: 'novo' })),
    excluir: vi.fn(async () => {}),
  };
});

import * as model from '@/src/models/tarefas/anexos';
import { listarAnexos, enviarAnexo, excluirAnexo, verAnexo } from './anexos';

function requisicaoCom(arquivo?: File) {
  const form = new FormData();
  if (arquivo) form.set('arquivo', arquivo);
  return new Request('http://x', { method: 'POST', body: form });
}

const png = () => new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png' });

beforeEach(() => {
  usuario.current = { id: 'u1' };
  vi.mocked(model.tarefaVisivel).mockResolvedValue(true);
  vi.clearAllMocks();
});

describe('permissão', () => {
  it('recusa id de tarefa inválido', async () => {
    expect((await listarAnexos('abc')).status).toBe(400);
  });
  it('recusa sem login', async () => {
    usuario.current = null;
    expect((await listarAnexos('1')).status).toBe(401);
  });
  it('recusa quem não enxerga a tarefa (outro usuário/projeto)', async () => {
    vi.mocked(model.tarefaVisivel).mockResolvedValueOnce(false);
    const resp = await enviarAnexo(requisicaoCom(png()), '1');
    expect(resp.status).toBe(404);
    expect(model.enviar).not.toHaveBeenCalled();
  });
});

describe('listar', () => {
  it('devolve os anexos da tarefa', async () => {
    const resp = await listarAnexos('1');
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual([{ id: 'a1' }]);
  });
});

describe('enviar', () => {
  it('aceita imagem válida', async () => {
    const resp = await enviarAnexo(requisicaoCom(png()), '1');
    expect(resp.status).toBe(201);
    expect(model.enviar).toHaveBeenCalledWith(expect.anything(), drive, 1, expect.objectContaining({ nome: 'a.png', tamanho: 2 }));
  });
  it('recusa requisição sem arquivo', async () => {
    expect((await enviarAnexo(requisicaoCom(), '1')).status).toBe(400);
  });
  it('recusa tipo inválido antes de enviar ao Drive', async () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const resp = await enviarAnexo(requisicaoCom(pdf), '1');
    expect(resp.status).toBe(400);
    expect((await resp.json()).erro).toMatch(/tipo não aceito/);
    expect(model.enviar).not.toHaveBeenCalled();
  });
  it('responde 500 com mensagem clara se o Drive falhar', async () => {
    vi.mocked(model.enviar).mockRejectedValueOnce(new Error('drive fora'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const resp = await enviarAnexo(requisicaoCom(png()), '1');
    expect(resp.status).toBe(500);
    expect((await resp.json()).erro).toBe('Não foi possível enviar o anexo.');
  });
});

describe('excluir e ver', () => {
  it('exclui anexo existente', async () => {
    expect((await excluirAnexo('1', 'a1')).status).toBe(204);
    expect(model.excluir).toHaveBeenCalled();
  });
  it('404 para anexo de outra tarefa', async () => {
    vi.mocked(model.buscar).mockResolvedValueOnce(null);
    expect((await excluirAnexo('1', 'zz')).status).toBe(404);
    expect(model.excluir).not.toHaveBeenCalled();
  });
  it('devolve a imagem com o tipo certo', async () => {
    const resp = await verAnexo('1', 'a1');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await resp.arrayBuffer())).toEqual(new Uint8Array([7, 7]));
  });
});
