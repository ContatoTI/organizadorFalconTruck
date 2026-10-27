import { describe, it, expect, vi } from 'vitest';
import { dbFalso } from '@/src/lib/testes/dbFalso';
import {
  validarArquivo, nomeColado, nomeFinal, caminhoPasta, enviar, excluir, ErroValidacao,
  type Armazenamento, type Anexo,
} from './anexos';

const MB = 1024 * 1024;

function armazenamentoFalso(): Armazenamento {
  return {
    garantirPasta: vi.fn(async () => 'pasta-1'),
    enviar: vi.fn(async () => 'arquivo-1'),
    baixar: vi.fn(async () => new Uint8Array()),
    enviarParaLixeira: vi.fn(async () => {}),
  };
}

const imagem = { nome: 'foto.png', mime: 'image/png', tamanho: 1000, dados: new Uint8Array([1]) };

describe('validarArquivo', () => {
  it('aceita imagem dentro do limite', () => {
    expect(validarArquivo({ nome: 'a.jpg', mime: 'image/jpeg', tamanho: 10 * MB })).toBeNull();
  });
  it('recusa tipo não aceito', () => {
    expect(validarArquivo({ nome: 'a.pdf', mime: 'application/pdf', tamanho: 10 })).toMatch(/tipo não aceito/);
  });
  it('recusa arquivo acima do limite', () => {
    expect(validarArquivo({ nome: 'a.png', mime: 'image/png', tamanho: 10 * MB + 1 })).toMatch(/10 MB/);
  });
  it('recusa arquivo vazio', () => {
    expect(validarArquivo({ nome: 'a.png', mime: 'image/png', tamanho: 0 })).toMatch(/vazio/);
  });
});

describe('nomes e pasta', () => {
  it('monta nome de imagem colada', () => {
    expect(nomeColado('image/png', new Date(2026, 9, 7, 9, 5, 3))).toBe('colado-20261007-090503.png');
    expect(nomeColado('image/jpeg', new Date(2026, 0, 1, 0, 0, 0))).toBe('colado-20260101-000000.jpg');
  });
  it('usa nome colado quando vem sem nome', () => {
    expect(nomeFinal('  ', 'image/png')).toMatch(/^colado-\d{8}-\d{6}\.png$/);
    expect(nomeFinal(' foto.png ', 'image/png')).toBe('foto.png');
  });
  it('monta caminho da pasta da tarefa', () => {
    expect(caminhoPasta(42)).toEqual(['Tarefas', '42']);
  });
});

describe('enviar', () => {
  it('envia ao armazenamento e grava o vínculo', async () => {
    const anexo = { id: 'a1' } as Anexo;
    const { db, chamadas } = dbFalso({ data: anexo });
    const arm = armazenamentoFalso();

    await expect(enviar(db, arm, 42, imagem)).resolves.toBe(anexo);
    expect(arm.garantirPasta).toHaveBeenCalledWith(['Tarefas', '42']);
    expect(arm.enviar).toHaveBeenCalledWith('pasta-1', 'foto.png', 'image/png', imagem.dados);
    expect(chamadas.insert[0][0]).toMatchObject({ tarefa_id: 42, drive_file_id: 'arquivo-1', tamanho: 1000 });
  });

  it('não envia nada se o arquivo for inválido', async () => {
    const { db } = dbFalso({});
    const arm = armazenamentoFalso();
    await expect(enviar(db, arm, 42, { ...imagem, mime: 'text/plain' })).rejects.toBeInstanceOf(ErroValidacao);
    expect(arm.enviar).not.toHaveBeenCalled();
  });

  it('manda o arquivo para a lixeira se o banco falhar', async () => {
    const { db } = dbFalso({ error: { message: 'falhou' } });
    const arm = armazenamentoFalso();
    await expect(enviar(db, arm, 42, imagem)).rejects.toThrow('falhou');
    expect(arm.enviarParaLixeira).toHaveBeenCalledWith('arquivo-1');
  });
});

describe('excluir', () => {
  const anexo = { id: 'a1', drive_file_id: 'arquivo-1' } as Anexo;

  it('marca como excluído e manda para a lixeira', async () => {
    const { db, chamadas } = dbFalso({});
    const arm = armazenamentoFalso();
    await excluir(db, arm, anexo);
    expect(chamadas.update[0][0]).toHaveProperty('excluido_em');
    expect(arm.enviarParaLixeira).toHaveBeenCalledWith('arquivo-1');
  });

  it('não mexe no Drive se o banco falhar', async () => {
    const { db } = dbFalso({ error: { message: 'falhou' } });
    const arm = armazenamentoFalso();
    await expect(excluir(db, arm, anexo)).rejects.toThrow('falhou');
    expect(arm.enviarParaLixeira).not.toHaveBeenCalled();
  });
});
