'use client';

// Preferências de exibição, pela rota /api/preferencias. Mesmos nomes do módulo antigo.

import type { UserPreferences } from '@/types/index';
import { chamarApi } from '@/src/lib/chamarApi';
import { PADRAO } from '@/src/models/preferencias/preferencias';

export async function fetchPreferences(): Promise<UserPreferences> {
  try {
    return await chamarApi<UserPreferences>('/api/preferencias');
  } catch (e) {
    console.error('Erro ao carregar preferências:', e);
    return { ...PADRAO };
  }
}

export async function savePreferences(preferences: UserPreferences): Promise<void> {
  try {
    await chamarApi('/api/preferencias', { method: 'PUT', json: preferences });
  } catch (err) {
    console.error('Erro ao salvar preferências:', err);
  }
}
