'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ArrowRight, XCircle, Plus, ChevronDown, Edit2, Trash2, Folder, Share, User, Search, Eye, EyeOff, Settings } from 'lucide-react';
import { cn, getSoftCardStyle } from '@/app/lib/utils';
import { taskAPI } from '@/app/lib/taskAPI';
import { projectAPI } from '@/app/lib/projectAPI';
import { notificationAPI } from '@/app/lib/notificationAPI';
import { useGroups } from '@/app/lib/GroupsContext';
import { fetchPreferences, savePreferences } from '@/app/lib/preferencesAPI';
import { emitTaskMoved, emitTaskMoveError, shouldSkipRealtimeFetch } from '@/app/lib/taskEvents';
import type { Task, Group, Project, Section, ProjectInviteNotification, User as AppUser, UserPreferences } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTaskItem } from '@/app/components/SortableTaskItem';
import { TaskDetailPanel } from '@/app/components/TaskDetailPanel';
import { InlineTaskCreator } from '@/app/components/InlineTaskCreator';
import { ToastProvider, useToast } from '@/app/components/Toast';

import { useDroppable } from '@dnd-kit/core';

function DroppableSection({ sectionId, children }: { sectionId: number | 'unsectioned', children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-${sectionId}`,
    data: {
      type: 'Section',
      id: sectionId
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-t border-border/50 min-h-[48px] transition-all duration-200",
        isOver && "bg-primary/5"
      )}
    >
      {children}
    </div>
  );
}

function DroppableBlock({ blockId, blockType, children }: { blockId: string; blockType: 'group' | 'project'; children: React.ReactNode }) {
  const numericId = parseInt(blockId.split(':')[1], 10);
  const { setNodeRef, isOver } = useDroppable({
    id: `${blockType}-${numericId}`,
    data: { type: blockType, id: numericId }
  });

  return (
    <div ref={setNodeRef} className={cn(isOver && "ring-2 ring-primary/30 rounded-[10px]")}>
      {children}
    </div>
  );
}

function DashboardContent() {
  const STATUS_GROUPS = [
    { key: 'a_fazer', label: 'A fazer', match: (s: string | null | undefined) => !s || s === 'a_fazer' },
    { key: 'em_andamento', label: 'Em andamento', match: (s: string | null | undefined) => s === 'em_andamento' },
    { key: 'concluida', label: 'Concluído', match: (s: string | null | undefined) => s === 'concluida' },
  ] as const;
  const [user, setUser] = useState<AppUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { groups, updateGroup } = useGroups();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [onlyToday, setOnlyToday] = useState(false);
  const [now, setNow] = useState(new Date());
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});
  const [sectionQuickAddOpen, setSectionQuickAddOpen] = useState<Record<number, boolean>>({});
  const [unsectionedQuickAddOpen, setUnsectionedQuickAddOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [unsectionedTitle, setUnsectionedTitle] = useState('Sem Pasta');
  const [editingUnsectionedTitle, setEditingUnsectionedTitle] = useState(false);
  const [unsectionedTitleDraft, setUnsectionedTitleDraft] = useState('Sem Pasta');
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [editingProjectNameDraft, setEditingProjectNameDraft] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{userId: string; memberId: number}[]>([]);
  const [projectPendingInvites, setProjectPendingInvites] = useState<string[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ProjectInviteNotification[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<number, boolean>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const client = createClient();
  const skipRealtimeFetchRef = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const creatingSectionRef = useRef(false);
  const skipSectionsFetchRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('showCompleted');
    if (stored !== null) setShowCompleted(stored !== 'false');
  }, []);

  useEffect(() => {
    if (user) {
      fetchPreferences(user.id).then(setPreferences);
    }
  }, [user]);

  // Sensors do dnd-kit: activationConstraint evita que um simples clique/tap
  // dispare um drag acidental (especialmente importante em telas touch)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const [showDashboardConfig, setShowDashboardConfig] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    show_my_tasks_only: false,
    show_only_time_blocks: false,
    show_only_lists: false,
  });
  const togglingItemsRef = useRef<Set<number>>(new Set());

  const setPreference = (key: keyof UserPreferences, value: boolean) => {
    const next: UserPreferences = { ...preferences, [key]: value };
    setPreferences(next);
    if (user) savePreferences(user.id, next);
  };

  const toggleProjectOnDashboard = async (project: Project) => {
    if (togglingItemsRef.current.has(project.id)) return;
    togglingItemsRef.current.add(project.id);
    const next = !project.show_on_dashboard;
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, show_on_dashboard: next } : p));
    await client.from('projects').update({ show_on_dashboard: next }).eq('id', project.id);
    toast(
      next ? `${project.name} adicionado ao Dashboard` : `${project.name} ocultado do Dashboard`,
      'success'
    );
    togglingItemsRef.current.delete(project.id);
  };

  const toggleGroupOnDashboard = async (group: Group) => {
    if (togglingItemsRef.current.has(group.id)) return;
    togglingItemsRef.current.add(group.id);
    const next = !group.show_on_dashboard;
    updateGroup(group.id, { show_on_dashboard: next });
    const { error } = await client.from('view_groups').update({ show_on_dashboard: next }).eq('id', group.id);
    if (error) {
      console.error('Erro ao alterar visibilidade do grupo:', error);
      toast(`Erro ao alterar visibilidade de "${group.title}"`, 'error');
    } else {
      toast(
        next ? `${group.title} adicionado ao Dashboard` : `${group.title} ocultado do Dashboard`,
        'success'
      );
    }
    togglingItemsRef.current.delete(group.id);
  };

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('pointermove', handler);
    return () => document.removeEventListener('pointermove', handler);
  }, []);

  const selectedGroupId = searchParams.get('group');
  const selectedProjectId = searchParams.get('project');
  const selectedGroup = selectedGroupId ? groups.find(g => g.id === parseInt(selectedGroupId)) : null;
  const selectedProject = selectedProjectId ? projects.find(p => p.id === parseInt(selectedProjectId)) : null;

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: authUser } } = await client.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }
      setUser(authUser as any);
    };
    getUser().finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (user) {
      fetchProjects();
      fetchPendingInvites(true);
      
      // Inscrição para atualizações em tempo real
      const channel = client
        .channel('dashboard-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'project_invites' },
          () => {
            fetchPendingInvites();
            if (selectedProjectId) {
              refreshShareModalData();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'project_members' },
          () => {
            fetchProjects();
            if (selectedProjectId) {
              refreshShareModalData();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projects' },
          () => fetchProjects()
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sections',
            ...(selectedProjectId ? { filter: `project_id=eq.${selectedProjectId}` } : {}),
          },
          () => {
            if (skipSectionsFetchRef.current) return;
            if (selectedProjectId) {
              fetchSections();
            }
          }
        )
        .subscribe();

      const handleProjectsUpdated = () => {
        fetchProjects();
      };
      const handleInviteProcessed = () => {
        fetchPendingInvites();
      };
      window.addEventListener('projects_updated', handleProjectsUpdated);
      window.addEventListener('invite_processed', handleInviteProcessed);

      return () => {
        client.removeChannel(channel);
        window.removeEventListener('projects_updated', handleProjectsUpdated);
        window.removeEventListener('invite_processed', handleInviteProcessed);
      };
    }
  }, [user, selectedProjectId]);

  useEffect(() => {
    if (user) {
      fetchTasks(true);

      const handleTasksUpdated = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.optimistic) {
          setTasks(prev => prev.map(t => {
            if (t.id !== detail.taskId) return t;
            if (detail.action === 'link_group') {
              return { ...t, linked_view_group_ids: [...(t.linked_view_group_ids || []), detail.groupId] };
            }
            if (detail.action === 'relink_group') {
              return {
                ...t,
                linked_view_group_ids: [
                  ...(t.linked_view_group_ids || []).filter((id: number) => id !== detail.sourceGroupId),
                  detail.groupId,
                ],
              };
            }
            if (detail.action === 'move_to_group') {
              return { ...t, view_group_id: detail.groupId, project_id: null, section_id: null, is_completed: false, status: 'a_fazer' };
            }
            if (detail.action === 'move_to_project') {
              return { ...t, project_id: detail.projectId, view_group_id: null, section_id: null };
            }
            return t;
          }));
        } else {
          fetchTasks();
        }
      };

      const todosChannel = client
        .channel(`todos-changes-${selectedProjectId || 'all'}-${selectedGroupId || 'all'}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'todos',
            ...(selectedProjectId ? { filter: `project_id=eq.${selectedProjectId}` } : {}),
          },
          () => {
            if (skipRealtimeFetchRef.current || shouldSkipRealtimeFetch()) { skipRealtimeFetchRef.current = false; return; }
            fetchTasks(false);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'task_view_groups' },
          (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
            if (skipRealtimeFetchRef.current || shouldSkipRealtimeFetch()) { skipRealtimeFetchRef.current = false; return; }
            const taskId = (payload.new?.task_id ?? payload.old?.task_id) as number | undefined;
            const groupId = (payload.new?.view_group_id ?? payload.old?.view_group_id) as number | undefined;
            if (!taskId || !groupId) { fetchTasks(false); return; }
            if (payload.eventType === 'INSERT') {
              setTasks(prev => prev.map(t =>
                t.id === taskId
                  ? { ...t, linked_view_group_ids: [...new Set([...(t.linked_view_group_ids ?? []), groupId])] }
                  : t
              ));
            } else if (payload.eventType === 'DELETE') {
              setTasks(prev => prev.map(t =>
                t.id === taskId
                  ? { ...t, linked_view_group_ids: (t.linked_view_group_ids ?? []).filter(id => id !== groupId) }
                  : t
              ));
            } else {
              fetchTasks(false);
            }
          }
        )
        .subscribe();

      window.addEventListener('tasks-updated', handleTasksUpdated);

      return () => {
        client.removeChannel(todosChannel);
        window.removeEventListener('tasks-updated', handleTasksUpdated);
      };
    }
  }, [user, selectedProjectId, selectedGroupId]);

  // ponytail: auto-refresh a cada 30s para reavaliar janelas de horário
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Função para atualizar dados do ShareModal
  const refreshShareModalData = async () => {
    if (!selectedProject) return;
    const members = await projectAPI.getProjectMembers(selectedProject.id);
    setProjectMembers(members.map(m => ({ userId: m.user_id, memberId: m.id })));
    
    const { data: invites } = await client
      .from('project_invites')
      .select('invited_user_id')
      .eq('project_id', selectedProject.id)
      .eq('status', 'pending');
    
    setProjectPendingInvites(invites?.map(i => i.invited_user_id) || []);
  };

  useEffect(() => {
    if (user && selectedProjectId) {
      fetchSections();
    } else {
      setSections(prev => prev.length === 0 ? prev : []);
    }
  }, [user, selectedProjectId]);

  // Faz merge dos projetos retornados pelo servidor com o estado local.
  // Preserva projetos recém-adicionados que o servidor ainda não enxerga (cache de RLS).
  const mergeProjects = (serverProjects: Project[]) => {
    setProjects((prev) => {
      const byId = new Map<number, Project>();
      prev.forEach((p) => byId.set(p.id, p));
      serverProjects.forEach((p) => byId.set(p.id, p));
      return Array.from(byId.values());
    });
  };

  const fetchProjects = async () => {
    if (!user) return;
    try {
      const allProjects = await projectAPI.getUserProjects(user.id);
      mergeProjects(allProjects);
    } catch (error) {
      console.error('Erro ao buscar projetos:', error);
      // Em caso de erro, NÃO sobrescreve o estado local.
    }
  };

  const fetchSections = async () => {
    if (!user || !selectedProjectId) return;

    const { data } = await client
      .from('sections')
      .select('*')
      .eq('project_id', parseInt(selectedProjectId))
      .order('order');

    if (data) {
      setSections(data as Section[]);
      setExpandedSections(prev => {
        const next: Record<number, boolean> = {};
        data.forEach(s => { next[s.id] = s.id in prev ? prev[s.id] : true; });
        const prevKeys = Object.keys(prev);
        if (prevKeys.length === data.length && data.every(s => s.id in prev)) {
          let same = true;
          for (const s of data) {
            if (prev[s.id] !== next[s.id]) { same = false; break; }
          }
          if (same) return prev;
        }
        return next;
      });
    }
  };

  const openShareModal = async () => {
    setShowShareModal(true);
    setLoadingUsers(true);
    const usersData = await client
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .neq('id', user?.id)
      .limit(50);
    if (usersData.data) setAllUsers(usersData.data as AppUser[]);

    if (selectedProject) {
      const members = await projectAPI.getProjectMembers(selectedProject.id);
      setProjectMembers(members.map(m => ({ userId: m.user_id, memberId: m.id })));
      
      const { data: invites } = await client
        .from('project_invites')
        .select('invited_user_id')
        .eq('project_id', selectedProject.id)
        .eq('status', 'pending');
      
      setProjectPendingInvites(invites?.map(i => i.invited_user_id) || []);
    } else {
      setProjectMembers([]);
      setProjectPendingInvites([]);
    }
    setLoadingUsers(false);
  };

  const toggleShareUser = async (targetUserId: string) => {
    if (!selectedProject || !user || selectedProject.owner_id !== user.id) return;
    
    const isMember = projectMembers.some(m => m.userId === targetUserId);
    const isPending = projectPendingInvites.includes(targetUserId);

    if (isMember) {
      const member = projectMembers.find(m => m.userId === targetUserId);
      if (member) {
        await projectAPI.removeProjectMember(selectedProject.id, targetUserId, user.id);
        setProjectMembers(prev => prev.filter(m => m.userId !== targetUserId));
      }
    } else if (isPending) {
      const { error } = await client
        .from('project_invites')
        .delete()
        .eq('project_id', selectedProject.id)
        .eq('invited_user_id', targetUserId)
        .eq('status', 'pending');
      if (!error) {
        setProjectPendingInvites(prev => prev.filter(id => id !== targetUserId));
      }
    } else {
      const result = await projectAPI.inviteUserToProject(selectedProject.id, targetUserId, user.id);
      if (result.success) {
        setProjectPendingInvites(prev => [...prev, targetUserId]);
      } else {
        toast(result.error || 'Erro ao convidar usuário', 'error');
      }
    }
  };

  const fetchTasks = async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    const data = await taskAPI.getUserTasks(user.id, {
      showCompleted: true,
      ...(selectedProjectId ? { projectId: parseInt(selectedProjectId) } : {}),
      ...(selectedGroupId && !selectedProjectId ? { groupId: parseInt(selectedGroupId) } : {}),
    });
    setTasks(data);
    if (showLoading) setLoading(false);
  };

  const fetchPendingInvites = async (isInitialLoad = false) => {
    if (!user) return;
    const invites = await notificationAPI.getPendingInvites(user.id);
    setPendingInvites(invites);
    if (isInitialLoad && invites.length > 0) {
      setShowInviteModal(true);
    }
    setInvitesLoaded(true);
  };

  const acceptInvite = async (inviteId: number, projectId: number) => {
    if (!user) return;

    const result = await notificationAPI.acceptInvite(inviteId, projectId, user.id);

    if (result.success) {
      // Adiciona o projeto ao estado local imediatamente (com ou sem dados da notificação)
      const inviteNotification = pendingInvites.find(inv => inv.id === inviteId);
      setProjects((prev) => {
        if (prev.some((p) => p.id === projectId)) return prev;
        return [...prev, {
          id: projectId,
          owner_id: '',
          name: inviteNotification?.project_title || 'Projeto',
          color: inviteNotification?.project_color || '#6366f1',
          show_on_dashboard: true,
        }];
      });

      // fetchProjects faz MERGE, então o item local não é sobrescrito
      await fetchProjects();

      // Notifica outros componentes (como o layout/sidebar) para atualizarem
      window.dispatchEvent(new CustomEvent('projects_updated', {
        detail: {
          projectId,
          name: inviteNotification?.project_title || 'Projeto',
          color: inviteNotification?.project_color || '#6366f1',
        },
      }));
      window.dispatchEvent(new CustomEvent('invite_processed'));

      // Remove o convite da lista local e fecha o modal se não houver mais
      setPendingInvites(prev => {
        const next = prev.filter(inv => inv.id !== inviteId);
        if (next.length === 0) {
          setShowInviteModal(false);
        }
        return next;
      });
    } else {
      toast(`Erro ao aceitar convite: ${result.error || 'desconhecido'}`, 'error');
    }
  };

  const declineInvite = async (inviteId: number) => {
    if (!user) return;
    const result = await notificationAPI.declineInvite(inviteId, user.id);
    if (!result.success) {
      console.error('Erro ao recusar convite:', result.error);
      return;
    }
    setPendingInvites(prev => {
      const next = prev.filter(inv => inv.id !== inviteId);
      if (next.length === 0) setShowInviteModal(false);
      return next;
    });
    window.dispatchEvent(new CustomEvent('invite_processed'));
  };

  const handleCreateTask = async (
    title: string,
    destination: { type: 'project' | 'group' | 'inbox'; id?: number },
    description?: string | null
  ) => {
    const trimmed = title.trim();
    if (!trimmed || !user) return;

    const titles = trimmed.split('\n').map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) return;

    const newOptimisticTasks = titles.map((taskTitle, index) => ({
      id: Date.now() + index,
      title: taskTitle,
      user_id: user.id,
      project_id: destination.type === 'project' ? destination.id : null,
      section_id: null,
      view_group_id: destination.type === 'group' ? destination.id : null,
      is_completed: false,
      position: 99999,
      created_at: new Date().toISOString(),
      due_date: null,
      description: description?.trim() || null,
      priority: null,
      status: 'a_fazer',
      creator_name: (user as any).user_metadata?.full_name || user.email,
      isSyncing: true,
    } as Task));

    setTasks(prev => [...newOptimisticTasks, ...prev]);

    const results = await Promise.all(titles.map(titleItem =>
      taskAPI.createTask(
        user.id,
        titleItem,
        destination.type === 'project' ? destination.id : undefined,
        undefined,
        destination.type === 'group' ? destination.id : undefined,
        undefined,
        description?.trim() || null
      )
    ));

    const hasError = results.some(r => !r.success);
    if (hasError) {
      const failedTempIds = new Set(newOptimisticTasks.filter((_, i) => !results[i].success).map(t => t.id));
      setTasks(prev => prev.filter(t => !failedTempIds.has(t.id)));
      toast('Erro ao criar tarefa(s)', 'error');
    }

    results.forEach((res, i) => {
      if (res.success && res.data) {
        const taskWithMeta = {
          ...res.data,
          creator_name: (user as any).user_metadata?.full_name || user.email,
        } as Task;
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === newOptimisticTasks[i].id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = { ...taskWithMeta, isSyncing: false };
            return next;
          }
          if (!prev.some(t => t.id === taskWithMeta.id)) {
            return [{ ...taskWithMeta, isSyncing: false }, ...prev];
          }
          return prev;
        });
      }
    });
  };

  const handleAddTask = async (sectionId: number | undefined, titleParam: string, groupOverrideId?: number, description?: string | null) => {
    const raw = titleParam.trim();
    if (!raw || !user) return;

    const titles = raw.split('\n').map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) return;

    const effectiveGroupId = groupOverrideId ?? (selectedGroupId && !selectedProjectId ? parseInt(selectedGroupId) : undefined);
    const desc = description?.trim() || null;
    
    // OPTIMISTIC UPDATE
    const newOptimisticTasks = titles.map((title, index) => ({
      id: Date.now() + index, // Temporary ID
      title,
      user_id: user.id,
      project_id: selectedProjectId ? parseInt(selectedProjectId) : null,
      section_id: sectionId || null,
      view_group_id: effectiveGroupId || null,
      is_completed: false,
      position: 99999,
      created_at: new Date().toISOString(),
      due_date: null,
      description: desc,
      priority: null,
      status: 'a_fazer',
      creator_name: (user as any).user_metadata?.full_name || user.email,
      isSyncing: true,
    } as Task));

    setTasks(prev => [...newOptimisticTasks, ...prev]);

    const results = await Promise.all(titles.map(title =>
      taskAPI.createTask(
        user.id,
        title,
        selectedProjectId ? parseInt(selectedProjectId) : undefined,
        sectionId,
        effectiveGroupId,
        undefined,
        desc
      )
    ));

    const hasError = results.some(r => !r.success);
    if (hasError) {
      const failedTempIds = new Set(newOptimisticTasks.filter((_, i) => !results[i].success).map(t => t.id));
      setTasks(prev => prev.filter(t => !failedTempIds.has(t.id)));
      toast('Erro ao criar tarefa(s)', 'error');
    }

    results.forEach((res, i) => {
      if (res.success && res.data) {
        const taskWithMeta = {
          ...res.data,
          creator_name: (user as any).user_metadata?.full_name || user.email,
        } as Task;
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === newOptimisticTasks[i].id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = { ...taskWithMeta, isSyncing: false };
            return next;
          }
          if (!prev.some(t => t.id === taskWithMeta.id)) {
            return [{ ...taskWithMeta, isSyncing: false }, ...prev];
          }
          return prev;
        });
      }
    });
  };

  const toggleTask = async (task: Task) => {
    // OPTIMISTIC UPDATE
    const newState = !task.is_completed;
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, is_completed: newState, status: newState ? 'concluida' : 'a_fazer', isSyncing: true } : t
    ));

    const result = await taskAPI.toggleTaskCompletion(task.id, task.is_completed);
    if (!result.success) {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: !newState, status: !newState ? 'concluida' : 'a_fazer', isSyncing: false } : t
      ));
      toast('Erro ao atualizar tarefa', 'error');
    } else {
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, isSyncing: false } : t
      ));
    }
  };

  const deleteTask = async (taskId: number) => {
    // OPTIMISTIC UPDATE: Injetar isSyncing: true
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;
    const originalTask = { ...taskToDelete };

    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, isSyncing: true } : t
    ));

    const result = await taskAPI.deleteTask(taskId);
    if (result.success) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? originalTask : t));
      toast('Erro ao excluir tarefa', 'error');
    }
  };

  const handlePriorityChange = async (taskId: number, priority: string | null) => {
    const original = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, priority, isSyncing: true } : t
    ));
    const result = await taskAPI.updateTask(taskId, { priority });
    if (!result.success) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...original!, isSyncing: false } : t));
      toast('Erro ao atualizar prioridade', 'error');
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isSyncing: false } : t));
    }
  };

  const createSection = async (title: string) => {
    if (!title.trim() || !user || !selectedProjectId) return;
    const nextOrder = sections.reduce((max, s) => Math.max(max, s.order ?? 0), -1) + 1;
    const { data } = await client
      .from('sections')
      .insert({
        user_id: user.id,
        project_id: parseInt(selectedProjectId),
        title: title.trim(),
        order: nextOrder,
      })
      .select()
      .single();

    if (data) {
      const newSection = data as Section;
      skipSectionsFetchRef.current = true;
      setSections(prev => prev.some(s => s.id === newSection.id) ? prev : [...prev, newSection]);
      setExpandedSections(prev => ({ ...prev, [newSection.id]: true }));
      setEditingSection(newSection.id);
      setEditingSectionTitle(newSection.title);
      setTimeout(() => { skipSectionsFetchRef.current = false; }, 500);
      return newSection;
    }

    return undefined;
  };

  const updateSection = async (sectionId: number, newTitle: string) => {
    if (!newTitle.trim()) return;
    await client.from('sections').update({ title: newTitle.trim() }).eq('id', sectionId);
    setSections(sections.map(s => s.id === sectionId ? { ...s, title: newTitle.trim() } : s));
    setEditingSection(null);
  };

  const deleteSection = async (sectionId: number) => {
    // OPTIMISTIC UPDATE
    const deletedSection = sections.find(s => s.id === sectionId);
    setSections(sections.filter(s => s.id !== sectionId));
    setTasks(prev => prev.map(t => t.section_id === sectionId ? { ...t, section_id: null } : t));

    // Garante que as tarefas voltem para a Caixa de Entrada (sem seção).
    // O banco já tem ON DELETE SET NULL, mas limpamos explicitamente como defesa em profundidade.
    await taskAPI.clearTasksFromSection(sectionId);
    const { error } = await client.from('sections').delete().eq('id', sectionId);
    
    if (error) {
      if (deletedSection) setSections(prev => [...prev, deletedSection]);
      await fetchTasks(false);
    } else {
      await fetchTasks(false);
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    }
  };

  const updateProjectName = async (newName: string) => {
    if (!selectedProject || !newName.trim()) return;
    const trimmed = newName.trim();
    await projectAPI.updateProject(selectedProject.id, { name: trimmed });
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, name: trimmed } : p));
    setEditingProjectName(false);
  };

  const deleteProject = async () => {
    if (!selectedProject || !user || selectedProject.owner_id !== user.id) return;
    if (!confirm(`Excluir "${selectedProject.name}"? As tarefas associadas voltarão para a Caixa de Entrada.`)) return;
    
    // OPTIMISTIC UPDATE
    const projectId = selectedProject.id;
    setProjects(projects.filter(p => p.id !== projectId));
    setTasks(prev => prev.map(t => t.project_id === projectId ? { ...t, project_id: null, section_id: null } : t));

    // Garante que as tarefas voltem para a Caixa de Entrada (sem projeto e sem seção).
    await taskAPI.clearTasksFromProject(projectId);
    const { error } = await client.from('projects').delete().eq('id', projectId);
    
    if (error) {
      await fetchProjects();
      await fetchTasks(false);
    } else {
      window.dispatchEvent(new CustomEvent('projects_updated'));
      window.dispatchEvent(new CustomEvent('tasks-updated'));
      router.push('/');
    }
  };

  const toggleSectionExpand = (sectionId: number) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const toggleSectionQuickAdd = (sectionId: number) => {
    setSectionQuickAddOpen(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const openSectionEdit = (section: Section) => {
    setEditingSection(section.id);
    setEditingSectionTitle(section.title);
  };

  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getProjectTasks = () => {
    return tasks.filter(task => {
      if (!selectedProjectId || task.project_id !== parseInt(selectedProjectId)) return false;
      if (!showCompleted && task.is_completed) return false;
      if (onlyToday && !isToday(task.due_date)) return false;
      return true;
    });
  };

  const getTasksBySection = (sectionId: number | null) => {
    const projectTasks = getProjectTasks();
    return projectTasks.filter(t => sectionId === null ? t.section_id == null : t.section_id === sectionId);
  };

  const getTasksBySectionAndStatus = (sectionId: number | null, statusKey: string) => {
    const group = STATUS_GROUPS.find(g => g.key === statusKey);
    if (!group) return [];
    return getTasksBySection(sectionId).filter(t => group.match(t.status));
  };

  // ponytail: só exibe tarefa de bloco de horário se a janela estiver aberta agora
  const isTimeWindowActive = (group: Group, currentTime: Date): boolean => {
    if (group.type !== 'time' || !group.start_time) return false;
    if (group.recurrence_type === 'weekly' && group.recurrence_days?.length) {
      if (!group.recurrence_days.includes(currentTime.getDay())) return false;
    }
    if (group.recurrence_type === 'monthly' && group.recurrence_days?.length) {
      if (!group.recurrence_days.includes(currentTime.getDate())) return false;
    }
    const pad2 = (n: number) => n.toString().padStart(2, '0');
    const cur = `${pad2(currentTime.getHours())}:${pad2(currentTime.getMinutes())}`;
    const end = group.end_time || group.start_time;
    return cur >= group.start_time && cur < end;
  };

  const shouldShowByTime = (task: Task, groupsList: Group[], currentTime: Date): boolean => {
    const ids = new Set<number>();
    if (task.view_group_id) ids.add(task.view_group_id);
    task.linked_view_group_ids?.forEach(id => ids.add(id));
    if (ids.size === 0) return true;
    for (const gid of ids) {
      const g = groupsList.find(gr => gr.id === gid);
      if (g && (g.type === 'list' || isTimeWindowActive(g, currentTime))) return true;
    }
    return false;
  };

  const filteredTasks = tasks.filter(t => {
    if (onlyToday) {
      const today = new Date().toISOString().split('T')[0];
      if (t.due_date !== today) return false;
    }
    if (!showCompleted && t.is_completed) return false;
    if (selectedProjectId) return t.project_id === parseInt(selectedProjectId);
    if (selectedGroupId) {
      if (t.view_group_id === parseInt(selectedGroupId)) return true;
      if (t.linked_view_group_ids?.includes(parseInt(selectedGroupId))) return true;
      return false;
    }
    if (preferences.show_my_tasks_only && t.user_id !== user?.id) return false;
    if (!shouldShowByTime(t, groups, now)) return false;
    return true;
  }).sort((a, b) => {
    const order: Record<string, number> = { alta: 3, media: 2, baixa: 1 };
    const pa = order[a.priority ?? ''] ?? 0;
    const pb = order[b.priority ?? ''] ?? 0;
    return pb - pa;
  });

  const filteredShareUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUsers.toLowerCase())
  );

  // Tipos de agrupamento para o Dashboard
  type GroupKey = string; // Pode ser 'inbox' | 'group:<id>' | 'project:<id>'

  // Chave única e estável para cada tarefa com base em sua associação real no banco
  const getTaskGroupKeys = (task: Task): GroupKey[] => {
    const keys: GroupKey[] = [];
    
    if (task.project_id == null && task.view_group_id == null && (!task.linked_view_group_ids || task.linked_view_group_ids.length === 0)) {
      keys.push('inbox');
      return keys;
    }
    
    if (task.project_id != null) {
      keys.push(`project:${task.project_id}`);
    }
    
    if (task.view_group_id != null) {
      keys.push(`group:${task.view_group_id}`);
    }
    
    if (task.linked_view_group_ids && task.linked_view_group_ids.length > 0) {
      task.linked_view_group_ids.forEach(gid => {
        const key = `group:${gid}`;
        if (!keys.includes(key)) {
          keys.push(key);
        }
      });
    }
    
    if (keys.length === 0) {
      keys.push('inbox');
    }
    
    return keys;
  };

  const groupedTasks = filteredTasks.reduce((acc: Record<string, Task[]>, task) => {
    const keys = getTaskGroupKeys(task);
    keys.forEach(key => {
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(task);
    });
    return acc;
  }, {} as Record<string, Task[]>);

  const getGroupInfo = (groupId: string | number): { title: string; color: string | null; link: string | null } => {
    const key = String(groupId);
    if (key === 'inbox') return { title: 'Caixa de Entrada', color: null, link: null };

    if (key.startsWith('project:')) {
      const id = parseInt(key.split(':')[1]);
      const project = projects.find(p => p.id === id);
      return {
        title: project?.name ?? 'Projeto sem nome',
        color: project?.color ?? null,
        link: `/?project=${id}`,
      };
    }

    if (key.startsWith('group:')) {
      const id = parseInt(key.split(':')[1]);
      const group = groups.find(g => g.id === id);
      return {
        title: group?.title ?? 'Sem Pasta',
        color: group?.color ?? null,
        link: `/?group=${id}`,
      };
    }

    return { title: 'Sem Pasta', color: null, link: null };
  };

  // Ordena as seções: Caixa de Entrada primeiro, depois projetos, depois blocos/listas
  const sortedGroupKeys = (Object.keys(groupedTasks) as GroupKey[]).sort((a, b) => {
    if (a === 'inbox') return -1;
    if (b === 'inbox') return 1;
    if (a.startsWith('project:') && !b.startsWith('project:')) return -1;
    if (!a.startsWith('project:') && b.startsWith('project:')) return 1;
    return a.localeCompare(b);
  });

  // Filtra chaves por tipo e visibilidade no Dashboard
  const dashboardProjectKeys = Array.from(new Set([
    ...sortedGroupKeys.filter(k => {
      if (!k.startsWith('project:')) return false;
      const id = parseInt(k.split(':')[1]);
      return projects.find(p => p.id === id)?.show_on_dashboard !== false;
    }),
    ...projects
      .filter(p => p.show_on_dashboard !== false)
      .map(p => `project:${p.id}`),
  ]));

  const dashboardTimeKeys = Array.from(new Set([
    ...sortedGroupKeys.filter(k => {
      if (!k.startsWith('group:')) return false;
      const id = parseInt(k.split(':')[1]);
      const g = groups.find(gr => gr.id === id);
      return g?.type === 'time' && g?.show_on_dashboard !== false && isTimeWindowActive(g, now);
    }),
    ...groups
      .filter(g => g.type === 'time' && g.show_on_dashboard !== false && isTimeWindowActive(g, now))
      .map(g => `group:${g.id}`),
  ]));
  const dashboardListKeys = sortedGroupKeys.filter(k => {
    if (!k.startsWith('group:')) return false;
    const id = parseInt(k.split(':')[1]);
    const g = groups.find(gr => gr.id === id);
    return g?.type === 'list' && g?.show_on_dashboard !== false;
  });
  const inboxKey = sortedGroupKeys.find(k => k === 'inbox');

  const handleRemoveFromGroup = async (taskId: number, currentGroupId: number) => {
    let snapshot: Task[] = [];
    setTasks(prev => {
      snapshot = prev;
      return prev.map(t =>
        t.id === taskId ? {
          ...t,
          view_group_id: t.view_group_id === currentGroupId ? null : t.view_group_id,
          linked_view_group_ids: t.linked_view_group_ids?.filter(id => id !== currentGroupId) || [],
          isSyncing: true
        } : t
      );
    });

    const result = await taskAPI.removeTaskFromGroup(taskId, currentGroupId);
    if (!result.success) {
      setTasks(snapshot);
      toast('Erro ao remover tarefa do grupo', 'error');
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isSyncing: false } : t));
    }
  };

  // ponytail: sidevar drop helpers, shared by dnd-kit path and sidebar fallback
  const execGroupDrop = useCallback((activeTask: Task, groupId: number) => {
    const sourceProjectId = activeTask.project_id;
    const sourceGroupId = activeTask.view_group_id;

    const originalTask = { ...activeTask };

    let updatedSnapshot: Task = activeTask;
    setTasks(prev => prev.map(t => {
      if (t.id !== activeTask.id) return t;
      if (sourceGroupId && sourceProjectId) {
        const nextLinked = (t.linked_view_group_ids || []).filter((id: number) => id !== sourceGroupId);
        updatedSnapshot = { ...t, view_group_id: t.view_group_id === sourceGroupId ? null : t.view_group_id, linked_view_group_ids: [...nextLinked, groupId], isSyncing: true };
        return updatedSnapshot;
      }
      if (sourceProjectId) {
        updatedSnapshot = { ...t, linked_view_group_ids: [...(t.linked_view_group_ids || []), groupId], isSyncing: true };
        return updatedSnapshot;
      }
      updatedSnapshot = { ...t, view_group_id: groupId, project_id: null, section_id: null, isSyncing: true };
      return updatedSnapshot;
    }));

    emitTaskMoved({
      taskId: activeTask.id,
      taskSnapshot: updatedSnapshot,
      from: {
        viewGroupId: sourceGroupId,
        projectId: sourceProjectId,
        sectionId: activeTask.section_id,
        linkedViewGroupIds: originalTask.linked_view_group_ids,
      },
    });

    const clearSyncing = () => setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, isSyncing: false } : t));

    skipRealtimeFetchRef.current = true;
    setTimeout(() => { skipRealtimeFetchRef.current = false; }, 1000);

    const handleMoveError = (errorMsg: string) => {
      setTasks(prev => prev.map(t => t.id === activeTask.id ? originalTask : t));
      emitTaskMoveError({ taskId: activeTask.id, originalTask, error: errorMsg });
      toast('Erro ao mover tarefa', 'error');
    };

    if (sourceProjectId) {
      if (sourceGroupId) {
        (async () => {
          const unlinkResult = await taskAPI.unlinkTaskFromGroup(activeTask.id, sourceGroupId);
          if (!unlinkResult.success) { handleMoveError(unlinkResult.error || 'Falha ao desvincular tarefa'); return; }
          const linkResult = await taskAPI.linkTaskToGroup(activeTask.id, groupId);
          if (!linkResult.success) { handleMoveError(linkResult.error || 'Falha ao vincular tarefa'); return; }
          clearSyncing();
        })();
      } else {
        (async () => {
          const linkResult = await taskAPI.linkTaskToGroup(activeTask.id, groupId);
          if (!linkResult.success) { handleMoveError(linkResult.error || 'Falha ao vincular tarefa'); return; }
          clearSyncing();
        })();
      }
    } else {
      (async () => {
        const moveResult = await taskAPI.moveTaskToGroup(activeTask.id, groupId);
        if (!moveResult.success) { handleMoveError(moveResult.error || 'Falha ao mover a tarefa'); return; }
        clearSyncing();
      })();
    }
  }, [setTasks, toast]);

  const execProjectDrop = useCallback((activeTask: Task, projectId: number) => {
    const originalTask = { ...activeTask };

    let updatedSnapshot: Task = { ...activeTask, project_id: projectId, view_group_id: null, section_id: null, isSyncing: true };
    setTasks(prev => prev.map(t => {
      if (t.id !== activeTask.id) return t;
      return updatedSnapshot;
    }));

    emitTaskMoved({
      taskId: activeTask.id,
      taskSnapshot: updatedSnapshot,
      from: {
        viewGroupId: originalTask.view_group_id,
        projectId: originalTask.project_id,
        sectionId: originalTask.section_id,
        linkedViewGroupIds: originalTask.linked_view_group_ids,
      },
    });

    const clearSyncing = () => setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, isSyncing: false } : t));

    skipRealtimeFetchRef.current = true;
    setTimeout(() => { skipRealtimeFetchRef.current = false; }, 1000);

    (async () => {
      const moveResult = await taskAPI.moveTaskToProject(activeTask.id, projectId);
      if (!moveResult.success) {
        setTasks(prev => prev.map(t => t.id === activeTask.id ? originalTask : t));
        emitTaskMoveError({
          taskId: activeTask.id,
          originalTask,
          error: moveResult.error || 'Falha ao mover a tarefa para o projeto',
        });
        toast('Erro ao mover tarefa para o projeto', 'error');
        return;
      }
      clearSyncing();
    })();
  }, [setTasks, toast]);

  const handleDragStart = (event: any) => {
    const { active } = event;
    if (active.data.current?.type === 'Task') {
      setActiveDragTask(active.data.current.task);
    }
  };

  const handleDragOver = (event: any) => {
    const { active } = event;
    if (active.data.current?.type === 'Task') {
      const pos = lastPointerPos.current;
      const elements = document.elementsFromPoint(pos.x, pos.y);
      const el = elements.find(el => el.closest('[data-sidebar-type]'))?.closest('[data-sidebar-type]');
      
      if (el) {
        const id = parseInt(el.getAttribute('data-sidebar-id')!);
        const type = el.getAttribute('data-sidebar-type') as 'group' | 'project';
        window.dispatchEvent(new CustomEvent('sidebar-drag-over', { detail: { id, type } }));
      } else {
        window.dispatchEvent(new CustomEvent('sidebar-drag-leave'));
      }
    }
  };

  const handleDragCancel = () => {
    setActiveDragTask(null);
    window.dispatchEvent(new CustomEvent('sidebar-drag-leave'));
  };

  const handleDragEnd = (event: any) => {
      setActiveDragTask(null);
      window.dispatchEvent(new CustomEvent('sidebar-drag-leave'));
      const { active, over } = event;

      // ponytail: sidebar fallback – dnd-kit blocks native HTML5 drag,
      // so we detect sidebar drops by cursor position
      if (active.data.current?.type === 'Task') {
        const activeTask = active.data.current.task as Task;
        
        // Melhorei aqui: detectamos sidebar SEMPRE que o mouse estiver lá no drop,
        // ignorando se o dnd-kit acha que está "over" algo (como uma seção de fundo)
        const pos = lastPointerPos.current;
        const elements = document.elementsFromPoint(pos.x, pos.y);
        const el = elements.find(e => e.closest('[data-sidebar-type]'))?.closest('[data-sidebar-type]');
          
        if (el) {
          const sidebarType = el.getAttribute('data-sidebar-type');
          const sidebarId = parseInt(el.getAttribute('data-sidebar-id')!);
          if (sidebarType === 'group') { execGroupDrop(activeTask, sidebarId); return; }
          if (sidebarType === 'project') { execProjectDrop(activeTask, sidebarId); return; }
        }
      }

      if (!over || active.id === over.id) return;
      if (active.data.current?.type !== 'Task') return;

      const activeTask = active.data.current.task as Task;
      let overType = over.data.current?.type;
      let overId = over.data.current?.id;

      // Fallback: parse over.id string if data ref is unavailable
      if (!overType || !overId) {
        const idStr = String(over.id);
        if (idStr.startsWith('group-')) {
          overType = 'group';
          overId = parseInt(idStr.slice(6), 10);
        } else if (idStr.startsWith('project-')) {
          overType = 'project';
          overId = parseInt(idStr.slice(8), 10);
        } else if (idStr.startsWith('section-')) {
          const raw = idStr.slice(8);
          overType = 'Section';
          overId = raw === 'unsectioned' ? 'unsectioned' : parseInt(raw, 10);
        }
      }

      if (!overType || !overId) return;

      // ─── GROUP DROP (sidebar: Blocos de Tempo / Listas) ──────────────
      if (overType === 'group') {
        execGroupDrop(activeTask, overId as number);
        return;
      }

      // ─── PROJECT DROP (sidebar) ──────────────────────────────────────
      if (overType === 'project') {
        execProjectDrop(activeTask, overId as number);
        return;
      }

      // ─── SECTION / TASK DROP (reorder within project) ────────────────
      if (overType !== 'Task' && overType !== 'Section') return;

      let targetSectionId: number | null = null;
      let targetIndex = 0;
      // NOVO: status de destino — por padrão mantém o status atual da tarefa.
      // Como as colunas visuais (A fazer / Em andamento / Concluído) são
      // SortableContexts separados, soltar numa coluna diferente precisa
      // persistir o novo status, senão a tarefa "volta" no próximo fetch.
      let targetStatus: string | null = activeTask.status ?? 'a_fazer';

      if (overType === 'Section') {
         targetSectionId = over.data.current!.id === 'unsectioned' ? null : over.data.current!.id as number;
         const tasksInSection = getTasksBySection(targetSectionId);
         targetIndex = tasksInSection.length;
      } else if (overType === 'Task') {
         const overTask = over.data.current!.task as Task;
         targetSectionId = overTask.section_id;
         // NOVO: herda o status da tarefa sobre a qual foi solto
         targetStatus = overTask.status ?? 'a_fazer';

         const tasksInSection = getTasksBySectionAndStatus(targetSectionId, targetStatus ?? 'a_fazer');
         targetIndex = tasksInSection.findIndex(t => t.id === overTask.id);
         
         const activeIndex = tasksInSection.findIndex(t => t.id === activeTask.id);
         if (activeIndex !== -1 && activeIndex < targetIndex) {
            targetIndex += 1;
         }
      }
      
      if (targetSectionId === undefined) return;

      const originalTaskForReorder = { ...activeTask };
      const statusChanged = targetStatus !== (activeTask.status ?? 'a_fazer');

      // Optimistic update
      setTasks(prev => {
        const next = [...prev];
        const taskIndex = next.findIndex(t => t.id === activeTask.id);
        if (taskIndex > -1) {
           const [movedTask] = next.splice(taskIndex, 1);
           movedTask.section_id = targetSectionId;
           movedTask.status = targetStatus ?? movedTask.status; // NOVO: aplica status otimisticamente
           movedTask.is_completed = targetStatus === 'concluida'; // NOVO: mantém is_completed coerente
           movedTask.isSyncing = true;
           
           // NOVO: calcula a posição absoluta considerando section_id + status,
           // já que agora as colunas visuais são separadas por status
           let absoluteIndex = 0;
           let sectionCount = 0;
           for (let i = 0; i < next.length; i++) {
             const sameSection = next[i].section_id === targetSectionId;
             const sameStatus = (next[i].status ?? 'a_fazer') === (targetStatus ?? 'a_fazer');
             if (sameSection && sameStatus) {
               if (sectionCount === targetIndex) {
                 absoluteIndex = i;
                 break;
               }
               sectionCount++;
             }
             absoluteIndex = i + 1;
           }
           
           next.splice(absoluteIndex, 0, movedTask);
        }
        return next;
      });

      skipRealtimeFetchRef.current = true;
      setTimeout(() => { skipRealtimeFetchRef.current = false; }, 1000);

      // NOVO: além de mover/reordenar, persiste o status se ele mudou
      (async () => {
        const moveResult = await taskAPI.moveTaskAndReorder(
          activeTask.id,
          targetSectionId,
          targetIndex,
          selectedProjectId ? parseInt(selectedProjectId) : null,
          selectedGroupId ? parseInt(selectedGroupId) : null
        );

        if (!moveResult.success) {
          setTasks(prev => prev.map(t => t.id === activeTask.id ? originalTaskForReorder : t));
          toast('Erro ao reorganizar tarefa', 'error');
          return;
        }

        if (statusChanged) {
          const statusResult = await taskAPI.updateTask(activeTask.id, {
            status: targetStatus,
            is_completed: targetStatus === 'concluida',
          });
          if (!statusResult.success) {
            setTasks(prev => prev.map(t => t.id === activeTask.id ? originalTaskForReorder : t));
            toast('Erro ao atualizar status da tarefa', 'error');
            return;
          }
        }

        setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, isSyncing: false } : t));
      })();
  };

  const renderTasksList = (tasksList: Task[], sectionId?: number, currentGroupId?: number) => {
    return (
      <SortableContext items={tasksList.map(t => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
        {tasksList.map(task => (
          <SortableTaskItem
            key={task.id}
            task={task}
            currentGroupId={currentGroupId}
            groups={groups}
            userEmail={user?.email}
            onToggle={toggleTask}
            onSelect={setSelectedTask}
            onRemoveFromGroup={currentGroupId ? handleRemoveFromGroup : undefined}
            onDelete={deleteTask}
            onPriorityChange={handlePriorityChange}
            isPending={!!pendingTaskIds[task.id]}
          />
        ))}
      </SortableContext>
    );
  };

  const renderStatusGroups = (sectionId: number | null) => {
    return STATUS_GROUPS.flatMap(group => {
      const groupTasks = getTasksBySectionAndStatus(sectionId, group.key);
      if (groupTasks.length === 0) return [];

      return (
        <div key={group.key}>
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 border-b border-border/40 text-xs font-medium uppercase tracking-wider text-muted-foreground/60"
            )}
          >
            <span>{group.label}</span>
            <span className="text-muted-foreground/40 font-normal normal-case ml-1">
              ({groupTasks.length})
            </span>
          </div>
          {renderTasksList(groupTasks, sectionId ?? undefined)}
        </div>
      );
    });
  };

  const renderDashboardBlock = (groupId: string, blockType: 'project' | 'group') => {
    const groupInfo = getGroupInfo(groupId);
    const groupTasks = groupedTasks[groupId] || [];
    const isTimeBlock = blockType === 'group' && groups.find(g => g.id === parseInt(groupId.split(':')[1]))?.type === 'time';
    const pendingCount = groupTasks.filter(t => !t.is_completed).length;
    const surfaceStyle = getSoftCardStyle(groupInfo.color);
    const inner = (
      <div className="mb-5">
        <div
          className="border rounded-[10px] overflow-hidden shadow-xs transition-colors duration-200"
          style={surfaceStyle}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-b border-border/40 gap-2" style={surfaceStyle}>
            <div className="flex items-center gap-2">
              <span
                className="text-[13px] font-semibold"
                style={groupInfo.color ? { color: groupInfo.color } : undefined}
              >
                {groupInfo.title}
              </span>
              <span className="text-[10px] font-medium bg-white/70 text-slate-500 px-2 py-0.5 rounded-full tabular-nums">
                {pendingCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {groupInfo.link && (
                <button
                  onClick={() => router.push(groupInfo.link!)}
                  className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors"
                >
                  Ver <ArrowRight className="w-3 h-3" />
                </button>
              )}
              <InlineTaskCreator
                destination={blockType === 'project'
                  ? { type: 'project', id: parseInt(groupId.split(':')[1], 10) }
                  : { type: 'group', id: parseInt(groupId.split(':')[1], 10) }}
                onCreateTask={handleCreateTask}
                buttonText="Adicionar"
                placeholder="Nova tarefa..."
              />
            </div>
          </div>
          <div className="px-0 py-1">
            {renderTasksList(groupTasks, undefined, blockType === 'group' ? parseInt(groupId.split(':')[1]) : undefined)}
          </div>
        </div>
      </div>
    );
    return <DroppableBlock key={groupId} blockId={groupId} blockType={blockType}>{inner}</DroppableBlock>;
  };

  if (!authChecked) {
    return <div className="p-6">Carregando...</div>;
  }
  if (!user) {
    return null;
  }

  const todayDisplay = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date()).replace(/^./, c => c.toUpperCase());

  const pageTitle = selectedProject ? selectedProject.name : selectedGroup ? selectedGroup.title : 'Dashboard';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="flex flex-col min-h-full">
      {/* Modal de Convites */}
      <Dialog open={showInviteModal && pendingInvites.length > 0} onOpenChange={(open) => !open && setShowInviteModal(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convites de Projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {pendingInvites.map((invite) => (
              <Card key={invite.id} className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: invite.project_color }}
                    >
                      <Folder className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{invite.project_title}</p>
                      <p className="text-xs text-muted-foreground">
                        Convidado por <span className="font-medium text-foreground">{invite.inviter_name}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 bg-green-500 hover:bg-green-600"
                      onClick={() => acceptInvite(invite.id, invite.project_id)}
                    >
                      Aceitar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => declineInvite(invite.id)}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Compartilhamento */}
      <Dialog open={showShareModal} onOpenChange={(open) => !open && setShowShareModal(false)}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Compartilhar projeto</DialogTitle>
          </DialogHeader>

          {/* Membros atuais */}
          {projectMembers.length > 0 && (
            <div className="mb-4 pb-4 border-b">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Membros atuais</p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {projectMembers.map((member) => {
                  const memberProfile = allUsers.find(u => u.id === member.userId);
                  return (
                    <div key={member.memberId} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                          {memberProfile?.avatar_url ? (
                            <img src={memberProfile.avatar_url} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <span className="text-sm font-medium">{memberProfile?.full_name || memberProfile?.email || 'Usuário'}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => toggleShareUser(member.userId)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Busca */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchUsers}
              onChange={(e) => setSearchUsers(e.target.value)}
              placeholder="Buscar usuário..."
              className="pl-9"
            />
          </div>

          {/* Lista de usuários */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {loadingUsers ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
            ) : filteredShareUsers.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Nenhum usuário encontrado</div>
            ) : (
              filteredShareUsers.map((u: AppUser) => {
                const isShared = projectMembers.some(m => m.userId === u.id);
                const isPending = projectPendingInvites.includes(u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none">{u.full_name || u.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">{u.email}</p>
                      </div>
                    </div>
                    <Button
                      variant={isShared ? "secondary" : isPending ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleShareUser(u.id)}
                      className={cn(
                        "rounded-full h-8",
                        isShared && "bg-green-100 text-green-700 hover:bg-green-200",
                        isPending && "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200"
                      )}
                    >
                      {isShared ? (
                        <><Check className="w-3 h-3 mr-1" /> Membro</>
                      ) : isPending ? (
                        <><Check className="w-3 h-3 mr-1" /> Pendente</>
                      ) : (
                        <><Plus className="w-3 h-3 mr-1" /> Convidar</>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Personalização do Dashboard */}
      <Dialog open={showDashboardConfig} onOpenChange={(open) => !open && setShowDashboardConfig(false)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Personalizar Dashboard</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-5 pr-2">
            {/* Preferências Globais */}
            <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Preferências</h3>
              </div>
              <div className="p-4 space-y-4">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-sm font-medium">Mostrar só minhas tarefas</span>
                    <p className="text-xs text-muted-foreground">Exibe apenas tarefas criadas por você</p>
                  </div>
                  <div
                    onClick={() => setPreference('show_my_tasks_only', !preferences.show_my_tasks_only)}
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                      preferences.show_my_tasks_only ? "bg-primary border-primary" : "border-slate-300 bg-white"
                    )}
                  >
                    {preferences.show_my_tasks_only && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-sm font-medium">Mostrar só blocos de tempo</span>
                    <p className="text-xs text-muted-foreground">Oculta Caixa de Entrada, Projetos e Listas</p>
                  </div>
                  <div
                    onClick={() => setPreference('show_only_time_blocks', !preferences.show_only_time_blocks)}
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                      preferences.show_only_time_blocks ? "bg-primary border-primary" : "border-slate-300 bg-white"
                    )}
                  >
                    {preferences.show_only_time_blocks && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                </label>
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div>
                    <span className="text-sm font-medium">Mostrar só listas</span>
                    <p className="text-xs text-muted-foreground">Oculta Caixa de Entrada, Projetos e Blocos de Tempo</p>
                  </div>
                  <div
                    onClick={() => setPreference('show_only_lists', !preferences.show_only_lists)}
                    className={cn(
                      "w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                      preferences.show_only_lists ? "bg-primary border-primary" : "border-slate-300 bg-white"
                    )}
                  >
                    {preferences.show_only_lists && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                </label>
              </div>
            </div>

            {/* Projetos */}
            <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Projetos</h3>
              </div>
              <div className="p-4">
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum projeto encontrado.</p>
                ) : (
                  <div className="space-y-1">
                    {projects.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-sm font-medium truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.show_on_dashboard !== false ? (
                            <Eye className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                          )}
                          <Switch
                            checked={p.show_on_dashboard !== false}
                            onCheckedChange={() => toggleProjectOnDashboard(p)}
                            size="sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Blocos de Tempo */}
            <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Blocos de Tempo</h3>
              </div>
              <div className="p-4">
                {groups.filter(g => g.type === 'time').length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum bloco de tempo encontrado.</p>
                ) : (
                  <div className="space-y-1">
                    {groups.filter(g => g.type === 'time').map(g => (
                      <div key={g.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors">
                        <span className="text-sm font-medium truncate">{g.title}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {g.show_on_dashboard !== false ? (
                            <Eye className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                          )}
                          <Switch
                            checked={g.show_on_dashboard !== false}
                            onCheckedChange={() => toggleGroupOnDashboard(g)}
                            size="sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Listas */}
            <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Listas</h3>
              </div>
              <div className="p-4">
                {groups.filter(g => g.type === 'list').length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma lista encontrada.</p>
                ) : (
                  <div className="space-y-1">
                    {groups.filter(g => g.type === 'list').map(g => (
                      <div key={g.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors">
                        <span className="text-sm font-medium truncate">{g.title}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {g.show_on_dashboard !== false ? (
                            <Eye className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                          )}
                          <Switch
                            checked={g.show_on_dashboard !== false}
                            onCheckedChange={() => toggleGroupOnDashboard(g)}
                            size="sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticky topbar */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            {selectedProject && editingProjectName ? (
              <Input
                value={editingProjectNameDraft}
                onChange={(e) => setEditingProjectNameDraft(e.target.value)}
                onBlur={() => updateProjectName(editingProjectNameDraft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateProjectName(editingProjectNameDraft);
                  if (e.key === 'Escape') { setEditingProjectName(false); setEditingProjectNameDraft(''); }
                }}
                className="h-9 text-xl font-semibold w-64"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground">{pageTitle}</h1>
                {selectedProject && user && selectedProject.owner_id === user.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setEditingProjectName(true); setEditingProjectNameDraft(selectedProject.name); }}
                    className="h-7 w-7 text-muted-foreground/50 hover:text-primary"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5">{todayDisplay}</p>
          </div>
          {(selectedProject || selectedGroup) && user ? (
            <div className="flex items-center gap-2">
              <InlineTaskCreator
                destination={selectedProject ? { type: 'project', id: selectedProject.id } : { type: 'group', id: selectedGroup!.id }}
                onCreateTask={handleCreateTask}
                buttonText="Nova tarefa"
                placeholder="Digite o nome da tarefa"
              />
            </div>
          ) : null}
          <div className="flex items-center gap-4 pr-10">
            {(selectedGroup || selectedProject) && (
              <Button variant="ghost" size="sm" onClick={() => router.push('/')} className="rounded-full h-7 text-xs gap-1">
                <XCircle className="w-3.5 h-3.5" /> Limpar filtro
              </Button>
            )}
            {selectedProject && user && selectedProject.owner_id === user.id && (
              <>
                <Button variant="outline" size="sm" onClick={openShareModal} className="rounded-full h-7 text-xs gap-1">
                  <Share className="w-3 h-3" /> Compartilhar
                </Button>
                <Button variant="destructive" size="sm" onClick={deleteProject} className="rounded-full h-7 text-xs gap-1">
                  <Trash2 className="w-3 h-3" /> Excluir
                </Button>
              </>
            )}
            {!selectedProject && (
              <InlineTaskCreator
                destination={{ type: 'inbox' }}
                onCreateTask={handleCreateTask}
                buttonText="Nova tarefa"
                placeholder="Título da tarefa…"
                autoFocus
                className="rounded-full h-7 text-xs gap-1"
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowDashboardConfig(true)} className="rounded-full h-7 text-xs gap-1" title="Personalizar Dashboard">
              <Settings className="w-3 h-3" /> Personalizar
            </Button>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <div
                onClick={() => { const v = !showCompleted; setShowCompleted(v); localStorage.setItem('showCompleted', String(v)); }}
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                  showCompleted ? "bg-primary border-primary" : "border-slate-300 bg-white"
                )}
              >
                {showCompleted && <Check className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />}
              </div>
              <span className="text-[12px] text-slate-500">Concluídas</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <div
                onClick={() => setOnlyToday(!onlyToday)}
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                  onlyToday ? "bg-primary border-primary" : "border-slate-300 bg-white"
                )}
              >
                {onlyToday && <Check className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />}
              </div>
              <span className="text-[12px] text-slate-500">Só hoje</span>
            </label>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-4xl mx-auto w-full px-6 py-5 flex-1">

      {/* MODO PROJETO: Seções expansíveis */}
      {selectedProject ? (
        <div className="space-y-4">
          {selectedProject.description && (
            <p className="text-sm text-muted-foreground px-1">{selectedProject.description}</p>
          )}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : sections.length === 0 && getProjectTasks().length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <p>Nenhuma pasta encontrada neste projeto.</p>
              <Button
                variant="default"
                size="sm"
                disabled={isCreatingSection}
                onClick={async () => {
                  if (creatingSectionRef.current) return;
                  creatingSectionRef.current = true;
                  setIsCreatingSection(true);
                  try {
                    await createSection('Nova pasta');
                  } finally {
                    creatingSectionRef.current = false;
                    setIsCreatingSection(false);
                  }
                }}
                className="rounded-full h-7 text-xs gap-1 mt-4"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova pasta
              </Button>
            </div>
          ) : (
            <>
              {/* Lista de Seções */}
              {sections.map((section) => (
                <Card
                  key={section.id}
                  className={cn(
                    "border-border/60 overflow-hidden shadow-card transition-all duration-200"
                  )}
                  style={getSoftCardStyle(selectedProject?.color)}
                >
                  {/* Header da seção */}
                  <div
                    className="flex items-center justify-between px-4 py-2 border-b border-border/60 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleSectionExpand(section.id)}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-muted-foreground transition-transform',
                          !expandedSections[section.id] && '-rotate-90'
                        )}
                      />
                      <Folder className="w-4 h-4 text-primary" />
                      {editingSection === section.id ? (
                        <Input
                          value={editingSectionTitle}
                          onChange={(e) => setEditingSectionTitle(e.target.value)}
                          onBlur={() => updateSection(section.id, editingSectionTitle)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateSection(section.id, editingSectionTitle);
                            if (e.key === 'Escape') { setEditingSection(null); setEditingSectionTitle(''); }
                          }}
                          className="h-8 py-1 text-sm font-semibold w-40"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-sm font-semibold text-left hover:text-primary transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSectionEdit(section);
                          }}
                        >
                          {section.title}
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        ({getTasksBySection(section.id).length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {sectionQuickAddOpen[section.id] ? (
                        <InlineTaskCreator
                          autoFocus
                          className="h-8 text-sm"
                          onCreateSimpleTask={(title, desc) => handleAddTask(section.id, title, undefined, desc)}
                          onCancel={() => toggleSectionQuickAdd(section.id)}
                          placeholder="Nova tarefa..."
                          buttonText=""
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleSectionQuickAdd(section.id)}
                          className="h-8 w-8 text-muted-foreground/50 hover:text-primary"
                          title="Adicionar tarefa nesta pasta"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openSectionEdit(section)}
                        className="h-8 w-8 text-muted-foreground/50 hover:text-primary"
                        title="Editar nome da pasta"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSection(section.id)}
                        className="h-8 w-8 text-muted-foreground/50 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Tarefas da seção */}
                  {expandedSections[section.id] && (
                    <DroppableSection sectionId={section.id}>
                      {renderStatusGroups(section.id)}
                      <div className="px-4 py-3 border-t border-border/60">
                        <InlineTaskCreator
                          onCreateSimpleTask={(title, desc) => handleAddTask(section.id, title, undefined, desc)}
                          buttonText="Adicionar tarefa"
                          placeholder="Adicionar nova tarefa"
                        />
                      </div>
                    </DroppableSection>
                  )}
                </Card>
              ))}

              {/* Tarefas sem seção: só exibe o card quando houver ao menos 1 tarefa órfã */}
              {getTasksBySection(null).length > 0 && (
              <Card
                  className={cn(
                    "border-border/60 overflow-hidden shadow-card transition-all duration-200"
                  )}
                  style={getSoftCardStyle(selectedProject?.color)}
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
                    <div className="flex items-center gap-3">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      {editingUnsectionedTitle ? (
                        <Input
                          value={unsectionedTitleDraft}
                          onChange={(e) => setUnsectionedTitleDraft(e.target.value)}
                          onBlur={() => {
                            if (unsectionedTitleDraft.trim()) {
                              setUnsectionedTitle(unsectionedTitleDraft.trim());
                            } else {
                              setUnsectionedTitleDraft(unsectionedTitle);
                            }
                            setEditingUnsectionedTitle(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (unsectionedTitleDraft.trim()) {
                                setUnsectionedTitle(unsectionedTitleDraft.trim());
                              }
                              setEditingUnsectionedTitle(false);
                            }
                            if (e.key === 'Escape') {
                              setUnsectionedTitleDraft(unsectionedTitle);
                              setEditingUnsectionedTitle(false);
                            }
                          }}
                          className="h-8 py-1 text-sm font-semibold w-40"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">{unsectionedTitle}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        ({getTasksBySection(null).length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {unsectionedQuickAddOpen ? (
                        <InlineTaskCreator
                          autoFocus
                          className="h-8 text-sm"
                          onCreateSimpleTask={(title, desc) => handleAddTask(undefined, title, undefined, desc)}
                          onCancel={() => setUnsectionedQuickAddOpen(false)}
                          placeholder="Nova tarefa..."
                          buttonText=""
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setUnsectionedQuickAddOpen(true)}
                          className="h-8 w-8 text-muted-foreground/50 hover:text-primary"
                          title="Adicionar tarefa nesta pasta"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingUnsectionedTitle(true);
                          setUnsectionedTitleDraft(unsectionedTitle);
                        }}
                        className="h-8 w-8 text-muted-foreground/50 hover:text-primary"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <DroppableSection sectionId={'unsectioned'}>
                    {renderStatusGroups(null)}
                    {getTasksBySection(null).length === 0 && (
                      <div className="px-4 py-3 text-xs text-muted-foreground/50 text-center italic">
                        Solte tarefas aqui para removê-las da organização
                      </div>
                    )}
                    <div className="px-4 py-3 border-t border-border/60">
                      <InlineTaskCreator
                        onCreateSimpleTask={(title, desc) => handleAddTask(undefined, title, undefined, desc)}
                        buttonText="Adicionar tarefa"
                        placeholder="Adicionar nova tarefa"
                      />
                    </div>
                  </DroppableSection>
                </Card>
              )}

              {/* Botão nova seção */}
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  disabled={isCreatingSection}
                  onClick={async () => {
                    if (creatingSectionRef.current) return;
                    creatingSectionRef.current = true;
                    setIsCreatingSection(true);
                    try {
                      await createSection('Nova pasta');
                    } finally {
                      creatingSectionRef.current = false;
                      setIsCreatingSection(false);
                    }
                  }}
                  className="rounded-full h-7 text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova pasta
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* MODO NORMAL: Lista única de tarefas */
        <div className="space-y-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <p>{selectedGroup ? 'Nenhuma tarefa neste grupo.' : 'Nenhuma tarefa encontrada.'}</p>
              <p className="text-sm mt-2">Adicione uma tarefa acima para começar.</p>
            </div>
          ) : (
            /* Seções organizadas do Dashboard */
            <>
              {!selectedGroup && (
                <>
                  {/* Caixa de Entrada */}
                  {!preferences.show_only_time_blocks && !preferences.show_only_lists && inboxKey && (() => {
                    const tasks = groupedTasks[inboxKey];
                    if (!tasks || tasks.length === 0) return null;
                    const pendingCount = tasks.filter(t => !t.is_completed).length;
                    return (
                      <div key={inboxKey} className="mb-5">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <div className="flex items-center gap-2">
                            <div className="w-[3px] h-[15px] rounded-full flex-shrink-0 bg-primary" />
                            <span className="text-[13px] font-semibold">Caixa de Entrada</span>
                            <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full tabular-nums">{pendingCount}</span>
                          </div>
                        </div>
                        <div className="border border-border rounded-[10px] overflow-hidden bg-card shadow-xs">
                          {renderTasksList(tasks)}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Blocos de Tempo */}
                  {!preferences.show_only_lists && dashboardTimeKeys.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Blocos de Tempo</h2>
                      {dashboardTimeKeys.map(groupId => renderDashboardBlock(groupId, 'group'))}
                    </div>
                  )}

                  {/* Projetos */}
                  {!preferences.show_only_time_blocks && !preferences.show_only_lists && dashboardProjectKeys.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Projetos</h2>
                      {dashboardProjectKeys.map(groupId => renderDashboardBlock(groupId, 'project'))}
                    </div>
                  )}

                  {/* Listas */}
                  {!preferences.show_only_time_blocks && dashboardListKeys.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Listas</h2>
                      {dashboardListKeys.map(groupId => renderDashboardBlock(groupId, 'group'))}
                    </div>
                  )}
                </>
              )}

              {/* Quando tem grupo selecionado: lista compacta única */}
              {selectedGroup && (
                <div
                  className="border rounded-[10px] overflow-hidden shadow-xs transition-colors duration-200"
                  style={getSoftCardStyle(selectedGroup.color)}
                >
                  {renderTasksList(filteredTasks, undefined, selectedGroup.id)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      </div>{/* end page content */}

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          groups={groups}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updatedTask) => {
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
            setSelectedTask(updatedTask);
          }}
          onMoveToGroup={(groupId) => execGroupDrop(selectedTask, groupId)}
        />
      )}

      {/* Drag Overlay */}
      <DragOverlay adjustScale={false} dropAnimation={null}>
        {activeDragTask ? (
          <SortableTaskItem
            task={activeDragTask}
            groups={groups}
            userEmail={user?.email}
            onToggle={() => {}}
            onSelect={() => {}}
            onDelete={() => {}}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Carregando...</div>}>
      <ToastProvider>
        <DashboardContent />
      </ToastProvider>
    </Suspense>
  );
}
