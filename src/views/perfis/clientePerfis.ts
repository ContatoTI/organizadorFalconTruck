'use client';

// Lista de pessoas (perfis) para as telas. Em erro devolve lista vazia, como antes.

import type { User } from '@/types/index';
import { chamarApi } from '@/src/lib/chamarApi';

export interface OpcoesPerfis {
  ids?: string[];
  /** Deixa você de fora. */
  excluirEu?: boolean;
  limite?: number;
}

export const perfilAPI = {
  async list(opcoes: OpcoesPerfis = {}): Promise<User[]> {
    if (opcoes.ids && opcoes.ids.length === 0) return [];
    const busca = new URLSearchParams();
    if (opcoes.ids) busca.set('ids', opcoes.ids.join(','));
    if (opcoes.excluirEu) busca.set('excluirEu', '1');
    if (opcoes.limite) busca.set('limite', String(opcoes.limite));
    try {
      return await chamarApi<User[]>(`/api/perfis?${busca}`);
    } catch (e) {
      console.error('[perfilAPI.list]', e);
      return [];
    }
  },
};
