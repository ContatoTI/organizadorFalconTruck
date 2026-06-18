'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import type { Task, Group, Project, Section, ProjectInvite, Finance, Goal } from '@/types/index';

/**
 * Hook genérico para fetch de dados do Supabase
 * Evita duplicação de lógica fetch+setLoading em múltiplos arquivos
 */
export function useFetchData<T>(
  tableName: string,
  filter?: Record<string, any>,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = createClient();

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const client_instance = createClient();
      const { data: { user } } = await client_instance.auth.getUser();
      if (!user?.id) {
        setData([]);
        return;
      }

      let query = client_instance
        .from(tableName)
        .select('*')
        .eq('user_id', user.id);

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      const { data: result, error: err } = await query;

      if (err) throw err;
      if (result) setData(result as T[]);
    } catch (err) {
      setError((err as Error).message);
      console.error(`Erro ao buscar ${tableName}:`, err);
    } finally {
      setLoading(false);
    }
  }, [tableName, JSON.stringify(filter)]);

  useEffect(() => {
    fetch();
  }, [fetch, ...dependencies]);

  const refetch = useCallback(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook para gerenciar estado de formulário CRUD
 * Evita duplicação de lógica em modais de edição
 */
export function useCRUDForm<T>(initialData: T) {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [data, setData] = useState<Partial<T>>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((item?: T) => {
    if (item) {
      setEditing(item);
      setData(item);
    } else {
      setEditing(null);
      setData(initialData);
    }
    setIsOpen(true);
  }, [initialData]);

  const close = useCallback(() => {
    setIsOpen(false);
    setEditing(null);
    setData(initialData);
    setError(null);
  }, [initialData]);

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
  }, [initialData]);

  const setField = useCallback((key: keyof T, value: any) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    isOpen,
    editing,
    data,
    loading,
    error,
    open,
    close,
    reset,
    setField,
    setLoading,
    setError,
    setData,
  };
}

/**
 * Hook para operações de toggle de status (completed)
 * Usado em tarefas, metas, etc
 */
export function useToggleCompletion() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = createClient();

  const toggle = useCallback(
    async (tableName: string, itemId: number, currentState: boolean) => {
      try {
        setLoading(true);
        setError(null);

        const { error: err } = await client
          .from(tableName)
          .update({ is_completed: !currentState })
          .eq('id', itemId);

        if (err) throw err;
        return { success: true, newState: !currentState };
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        console.error(`Erro ao atualizar ${tableName}:`, err);
        return { success: false, newState: currentState };
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { toggle, loading, error };
}

/**
 * Hook para gerenciar expandir/colapsar seções
 */
export function useExpandedSections(initialExpanded: Record<number, boolean> = {}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>(initialExpanded);

  const toggle = useCallback((id: number) => {
    setExpanded(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const toggleAll = useCallback((ids: number[], state: boolean) => {
    setExpanded(prev => ({
      ...prev,
      ...ids.reduce((acc, id) => ({ ...acc, [id]: state }), {}),
    }));
  }, []);

  return { expanded, toggle, toggleAll };
}

/**
 * Hook para gerenciar filtros de lista
 */
export function useListFilters(initialFilters: Record<string, any> = {}) {
  const [filters, setFilters] = useState(initialFilters);

  const updateFilter = useCallback((key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const setAllFilters = useCallback((newFilters: Record<string, any>) => {
    setFilters(newFilters);
  }, []);

  return { filters, updateFilter, clearFilters, setAllFilters };
}

/**
 * Hook para gerenciar modal de notificações
 */
export function useNotificationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const addNotification = useCallback((notification: any) => {
    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const markAsRead = useCallback((notificationId: number) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  return {
    isOpen,
    notifications,
    unreadCount,
    open,
    close,
    addNotification,
    clearNotifications,
    markAsRead,
  };
}
