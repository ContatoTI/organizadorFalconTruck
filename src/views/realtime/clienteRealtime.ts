'use client';

/**
 * Atualização em tempo real (Supabase Realtime) no navegador.
 * Fica do lado da tela: só avisa "algo mudou", quem busca os dados é a tela.
 */

import { createClient } from '@/src/lib/supabase/Client';

export interface TabelaOuvida {
  tabela: string;
  /** Filtro do Supabase, ex.: `user_id=eq.123`. Sem filtro = qualquer linha. */
  filtro?: string;
}

/** Ouve mudanças nas tabelas. Devolve a função para parar de ouvir. */
export function ouvirMudancas(canal: string, tabelas: TabelaOuvida[], aoMudar: () => void): () => void {
  const client = createClient();
  let channel = client.channel(canal);
  for (const { tabela, filtro } of tabelas) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tabela, ...(filtro ? { filter: filtro } : {}) },
      () => aoMudar(),
    );
  }
  channel.subscribe();
  return () => { client.removeChannel(channel); };
}
