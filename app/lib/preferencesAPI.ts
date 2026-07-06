'use client';

import { createClient } from '@/app/lib/supabase/Client';
import type { UserPreferences } from '@/types/index';

const DEFAULTS: UserPreferences = {
  show_my_tasks_only: false,
  show_inbox: true,
  show_time_blocks: true,
  show_projects: true,
  show_lists: true,
};

export async function fetchPreferences(userId: string): Promise<UserPreferences> {
  const client = createClient();
  const { data } = await client
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.preferences && typeof data.preferences === 'object') {
    const raw = data.preferences as Record<string, unknown>;
    const prefs: UserPreferences = { ...DEFAULTS };
    if (typeof raw.show_my_tasks_only === 'boolean') prefs.show_my_tasks_only = raw.show_my_tasks_only;
    if (typeof raw.show_inbox === 'boolean') prefs.show_inbox = raw.show_inbox;
    if (typeof raw.show_time_blocks === 'boolean') prefs.show_time_blocks = raw.show_time_blocks;
    if (typeof raw.show_projects === 'boolean') prefs.show_projects = raw.show_projects;
    if (typeof raw.show_lists === 'boolean') prefs.show_lists = raw.show_lists;
    // Migra modelo antigo (show_only_time_blocks / show_only_lists)
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