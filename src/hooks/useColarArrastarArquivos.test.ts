import { describe, it, expect } from 'vitest';
import { arquivosDoColar } from './useColarArrastarArquivos';

const print = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });

describe('arquivosDoColar', () => {
  it('pega a imagem de um print colado', () => {
    expect(arquivosDoColar({ files: [print], types: ['Files'] })).toEqual([print]);
  });
  it('não interfere quando o colar tem texto', () => {
    expect(arquivosDoColar({ files: [print], types: ['text/plain', 'Files'] })).toEqual([]);
  });
  it('texto puro não vira anexo', () => {
    expect(arquivosDoColar({ files: [], types: ['text/plain'] })).toEqual([]);
  });
});
