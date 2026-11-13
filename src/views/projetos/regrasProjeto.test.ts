import { describe, it, expect } from 'vitest';
import { pastasDoTexto, erroNomeProjeto, confirmaExclusao, MODELOS_PASTAS } from './regrasProjeto';

describe('pastasDoTexto', () => {
  it('separa por linha, tira espaços, vazios e repetidos', () => {
    expect(pastasDoTexto(' Layout \n\nFotos\nlayout\n  \nEtiquetas')).toEqual(['Layout', 'Fotos', 'Etiquetas']);
  });

  it('texto vazio vira lista vazia', () => {
    expect(pastasDoTexto('')).toEqual([]);
  });
});

describe('erroNomeProjeto', () => {
  it('nome vazio ou só espaço dá erro', () => {
    expect(erroNomeProjeto('')).not.toBeNull();
    expect(erroNomeProjeto('   ')).not.toBeNull();
  });

  it('nome preenchido passa', () => {
    expect(erroNomeProjeto('Catalogo')).toBeNull();
  });
});

describe('confirmaExclusao', () => {
  it('aceita o nome igual, ignorando maiúsculas e espaços nas pontas', () => {
    expect(confirmaExclusao('Catalogo Falcons', '  catalogo falcons ')).toBe(true);
  });

  it('recusa nome diferente ou vazio', () => {
    expect(confirmaExclusao('Catalogo Falcons', 'Catalogo')).toBe(false);
    expect(confirmaExclusao('', '')).toBe(false);
  });
});

describe('MODELOS_PASTAS', () => {
  it('todo modelo tem nome e ao menos uma pasta', () => {
    for (const m of MODELOS_PASTAS) {
      expect(m.nome).toBeTruthy();
      expect(m.pastas.length).toBeGreaterThan(0);
    }
  });
});
