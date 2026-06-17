'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/app/lib/supabase/Client';

interface Group {
  id: number;
  user_id: string;
  title: string;
  type: 'time' | 'list';
  icon: string | null;
  color: string | null;
  start_time: string | null;
  end_time: string | null;
  recurrence_type: string | null;
  recurrence_days: number[] | null;
  created_at: string;
}

interface GroupsContextType {
  groups: Group[];
  loading: boolean;
  refreshGroups: () => void;
  addGroup: (group: Group) => void;
}

const GroupsContext = createContext<GroupsContextType>({
  groups: [],
  loading: true,
  refreshGroups: () => {},
  addGroup: () => {},
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

    if (data) setGroups(data);
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

  return (
    <GroupsContext.Provider value={{ groups, loading, refreshGroups, addGroup }}>
      {children}
    </GroupsContext.Provider>
  );
}
