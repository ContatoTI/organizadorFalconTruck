'use client';

import { createClient } from '@/app/lib/supabase/Client';
import type { UserPreferences } from '@/types/index';

const DEFAULTS: UserPreferences = {
  show_my_tasks_only: false,
  show_only_time_blocks: false,
  show_only_lists: false,
};

export async function fetchPreferences(userId: string): Promise<UserPreferences> {
  const client = createClient();
  const { data } = await client
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.preferences && typeof data.preferences === 'object') {
    return { ...DEFAULTS, ...(data.preferences as Partial<UserPreferences>) };
  }
  return { ...DEFAULTS };
}

export async function savePreferences(
  userId: string,
  preferences: UserPreferences
): Promise<void> {
  const client = createClient();
  try {
    const { data: existing } = await client
      .from('user_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await client
        .from('user_preferences')
        .update({ preferences, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    } else {
      await client
        .from('user_preferences')
        .insert({ user_id: userId, preferences });
    }
  } catch (err) {
    console.error('Erro ao salvar preferências:', err);
  }
}
