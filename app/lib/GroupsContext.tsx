'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import type { Group } from '@/types/index';

interface GroupsContextType {
  groups: Group[];
  loading: boolean;
  refreshGroups: () => void;
  addGroup: (group: Group) => void;
  deleteGroup: (groupId: number) => void;
  updateGroup: (id: number, updates: Partial<Group>) => void;
}

const GroupsContext = createContext<GroupsContextType>({
  groups: [],
  loading: true,
  refreshGroups: () => {},
  addGroup: () => {},
  deleteGroup: () => {},
  updateGroup: () => {},
});

export function useGroups() {
  return useContext(GroupsContext);
}

export function GroupsProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const client = createClient();

  const fetchGroups = async () => {
    setLoading(true);
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const { data } = await client
      .from('view_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at');

    if (data) {
      setGroups(prev => {
        const byId = new Map(prev.map(g => [g.id, g]));
        (data as Group[]).forEach(g => byId.set(g.id, g));
        return Array.from(byId.values());
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        fetchGroups();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ponytail: realtime em view_groups — sincroniza blocos/listas entre abas/dispositivos.
  // Refaz fetch apenas para o usuário dono da linha alterada (RLS já filtra no servidor).
  useEffect(() => {
    const channel = client
      .channel('groups-context-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'view_groups' },
        () => fetchGroups()
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, []);

  const refreshGroups = () => {
    fetchGroups();
  };

  const addGroup = (group: Group) => {
    setGroups(prev => [group, ...prev]);
  };

  const deleteGroup = (groupId: number) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const updateGroup = (id: number, updates: Partial<Group>) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  return (
    <GroupsContext.Provider value={{ groups, loading, refreshGroups, addGroup, deleteGroup, updateGroup }}>
      {children}
    </GroupsContext.Provider>
  );
}
