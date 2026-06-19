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
}

const GroupsContext = createContext<GroupsContextType>({
  groups: [],
  loading: true,
  refreshGroups: () => {},
  addGroup: () => {},
  deleteGroup: () => {},
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

    if (data) setGroups(data as Group[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
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

  return (
    <GroupsContext.Provider value={{ groups, loading, refreshGroups, addGroup, deleteGroup }}>
      {children}
    </GroupsContext.Provider>
  );
}
