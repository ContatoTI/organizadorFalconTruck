import { describe, it, expect } from 'vitest';
import { dbRoteiro } from '@/src/lib/testes/dbRoteiro';
import { normalizar, buscar, salvar, PADRAO } from './preferencias';

describe('normalizar', () => {
  it('vazio ou lixo vira o padrão', () => {
    expect(normalizar(null)).toEqual(PADRAO);
    expect(normalizar({ show_inbox: 'sim', focus_mode: 1 })).toEqual(PADRAO);
  });
  it('mantém o que é válido', () => {
    expect(normalizar({ show_inbox: false, last_capture_target: 'grupo-3' }))
      .toMatchObject({ show_inbox: false, last_capture_target: 'grupo-3', show_projects: true });
  });
  it('migra o modelo antigo show_only_time_blocks', () => {
    expect(normalizar({ show_only_time_blocks: true }))
      .toMatchObject({ show_time_blocks: true, show_inbox: false, show_projects: false, show_lists: false });
  });
});

describe('banco', () => {
  it('buscar normaliza o que vier', async () => {
    const { db } = dbRoteiro({ user_preferences: [{ data: { preferences: { focus_mode: false } } }] });
    expect(await buscar(db, 'u1')).toMatchObject({ focus_mode: false, show_inbox: true });
  });
  it('salvar atualiza quem já tem e insere quem não tem', async () => {
    const a = dbRoteiro({ user_preferences: [{ data: { id: 1 } }, {}] });
    await salvar(a.db, 'u1', PADRAO);
    expect(a.gravacoes[0]).toMatchObject({ op: 'update', valor: { preferences: PADRAO } });

    const b = dbRoteiro({ user_preferences: [{ data: null }, {}] });
    await salvar(b.db, 'u1', PADRAO);
    expect(b.gravacoes[0]).toMatchObject({ op: 'insert', valor: { user_id: 'u1', preferences: PADRAO } });
  });
});
