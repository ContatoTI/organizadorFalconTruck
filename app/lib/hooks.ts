'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
 * Hook para exclusão com "Desfazer".
 * A exclusão real no backend é adiada por `delayMs`; se o usuário desfizer
 * antes do prazo, o item é restaurado no estado local e a chamada ao backend
 * é cancelada (nunca chega a apagar nada no banco).
 */
export function useUndoableDelete<T>({
  deleteFn,
  onRemove,
  onRestore,
  toast,
  getId,
  delayMs = 5000,
}: {
  deleteFn: (item: T) => Promise<{ success: boolean; error?: string }>;
  onRemove: (item: T) => void;
  onRestore: (item: T) => void;
  toast: (message: string, type?: 'success' | 'error' | 'info', options?: { action?: { label: string; onClick: () => void }; duration?: number }) => void;
  getId: (item: T) => number | string;
  delayMs?: number;
}) {
  const pendingRef = useRef<Map<number | string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((item: T, message = 'Item excluído') => {
    const id = getId(item);

    const existingTimer = pendingRef.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    onRemove(item);

    const timer = setTimeout(async () => {
      pendingRef.current.delete(id);
      const result = await deleteFn(item);
      if (!result.success) {
        onRestore(item);
        toast(result.error || 'Erro ao excluir item', 'error');
      }
    }, delayMs);

    pendingRef.current.set(id, timer);

    toast(message, 'info', {
      duration: delayMs,
      action: {
        label: 'Desfazer',
        onClick: () => {
          const t = pendingRef.current.get(id);
          if (!t) return;
          clearTimeout(t);
          pendingRef.current.delete(id);
          onRestore(item);
        },
      },
    });
  }, [deleteFn, onRemove, onRestore, toast, getId, delayMs]);

  return { remove };
}

/**
 * Concluir tarefa com desfazer.
 *
 * Diferente da exclusão, aqui a gravação vale na hora — marcar como feito é a
 * ação mais frequente do app e não pode ficar pendurada num timer. O desfazer
 * simplesmente escreve o estado anterior de volta.
 *
 * Quem chama continua responsável pelo estado otimista da lista; este hook
 * cuida de gravar, reverter em erro e oferecer o "Desfazer" no toast.
 */
export function useUndoableComplete<T extends { id: number; is_completed: boolean; status?: string | null; title: string }>({
  apply,
  persist,
  toast,
  durationMs = 6000,
}: {
  /** Reflete o novo estado na lista (otimista e também na reversão). */
  apply: (id: number, completed: boolean) => void;
  persist: (id: number, completed: boolean) => Promise<{ success: boolean; error?: string }>;
  toast: (message: string, type?: 'success' | 'error' | 'info', options?: { action?: { label: string; onClick: () => void }; duration?: number }) => void;
  durationMs?: number;
}) {
  const toggle = useCallback(async (item: T) => {
    const next = !item.is_completed;

    apply(item.id, next);

    const result = await persist(item.id, next);
    if (!result.success) {
      apply(item.id, item.is_completed);
      toast(result.error || 'Erro ao atualizar tarefa', 'error');
      return;
    }

    // Reabrir uma tarefa não precisa de desfazer: o próprio ato já é o desfazer.
    if (!next) return;

    const shortTitle = item.title.length > 32 ? item.title.slice(0, 32) + '…' : item.title;
    toast(`Concluída: ${shortTitle}`, 'success', {
      duration: durationMs,
      action: {
        label: 'Desfazer',
        onClick: async () => {
          apply(item.id, false);
          const undo = await persist(item.id, false);
          if (!undo.success) {
            apply(item.id, true);
            toast(undo.error || 'Não deu para desfazer', 'error');
          }
        },
      },
    });
  }, [apply, persist, toast, durationMs]);

  return { toggle };
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
