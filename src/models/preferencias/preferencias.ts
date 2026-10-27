/**
 * Preferências de exibição do usuário (tabela user_preferences):
 * um JSON por usuário com o que mostrar no painel.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPreferences } from '@/types/index';

export const PADRAO: UserPreferences = {
  show_my_tasks_only: false,
  show_inbox: true,
  show_time_blocks: true,
  show_projects: true,
  show_lists: true,
  focus_mode: true,
  last_capture_target: 'inbox',
};

const BOOLEANOS = [
  'show_my_tasks_only', 'show_inbox', 'show_time_blocks', 'show_projects', 'show_lists', 'focus_mode',
] as const;

/** Preenche os padrões, ignora lixo e migra o modelo antigo (show_only_*). */
export function normalizar(bruto: unknown): UserPreferences {
  const prefs: UserPreferences = { ...PADRAO };
  if (!bruto || typeof bruto !== 'object') return prefs;
  const raw = bruto as Record<string, unknown>;

  for (const campo of BOOLEANOS) {
    if (typeof raw[campo] === 'boolean') prefs[campo] = raw[campo] as boolean;
  }
  if (typeof raw.last_capture_target === 'string') prefs.last_capture_target = raw.last_capture_target;

  // Migra modelo antigo (show_only_time_blocks / show_only_lists).
  if (typeof raw.show_time_blocks !== 'boolean' && typeof raw.show_only_time_blocks === 'boolean') {
    prefs.show_time_blocks = true;
    if (raw.show_only_time_blocks) {
      prefs.show_inbox = false;
      prefs.show_projects = false;
      prefs.show_lists = false;
    }
  }
  if (typeof raw.show_lists !== 'boolean' && typeof raw.show_only_lists === 'boolean') {
    prefs.show_lists = true;
    if (raw.show_only_lists) {
      prefs.show_inbox = false;
      prefs.show_projects = false;
      prefs.show_time_blocks = false;
    }
  }
  return prefs;
}

export async function buscar(db: SupabaseClient, usuarioId: string): Promise<UserPreferences> {
  const { data } = await db
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', usuarioId)
    .maybeSingle();
  return normalizar((data as { preferences: unknown } | null)?.preferences);
}

export async function salvar(db: SupabaseClient, usuarioId: string, preferencias: UserPreferences): Promise<void> {
  const { data: existente } = await db
    .from('user_preferences')
    .select('id')
    .eq('user_id', usuarioId)
    .maybeSingle();

  const { error } = existente
    ? await db
      .from('user_preferences')
      .update({ preferences: preferencias, updated_at: new Date().toISOString() })
      .eq('user_id', usuarioId)
    : await db.from('user_preferences').insert({ user_id: usuarioId, preferences: preferencias });
  if (error) throw new Error(error.message);
}
