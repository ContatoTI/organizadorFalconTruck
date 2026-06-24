'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X, ArrowRight, XCircle, Plus, ChevronDown, Edit2, Trash2, Folder, Share, User, Search } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { taskAPI } from '@/app/lib/taskAPI';
import { projectAPI } from '@/app/lib/projectAPI';
import { notificationAPI } from '@/app/lib/notificationAPI';
import type { Task, Group, Project, Section, ProjectInviteNotification, User as AppUser } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TaskDetailPanel } from '@/app/components/TaskDetailPanel';

function DashboardContent() {
  const STATUS_GROUPS = [
    { key: 'a_fazer', label: 'A fazer', match: (s: string | null | undefined) => !s || s === 'a_fazer' },
    { key: 'em_andamento', label: 'Em andamento', match: (s: string | null | undefined) => s === 'em_andamento' },
    { key: 'concluida', label: 'Concluído', match: (s: string | null | undefined) => s === 'concluida' },
  ] as const;
  const getInitials = (name: string) => {
    const namePart = name.includes('@') ? name.split('@')[0] : name;
    const parts = namePart.split(/[.\s_-]+/);
    return parts.map(p => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
  };

  const getColorFromString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 50%)`;
  };

  const [user, setUser] = useState<AppUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [onlyToday, setOnlyToday] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{userId: string; memberId: number}[]>([]);
  const [projectPendingInvites, setProjectPendingInvites] = useState<string[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ProjectInviteNotification[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<number | 'unsectioned' | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [droppedTaskId, setDroppedTaskId] = useState<number | null>(null);
  const [dragOverStatusGroup, setDragOverStatusGroup] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = createClient();

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
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchGroups();
      fetchProjects();
      fetchTasks(true);
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
              // Atualiza convites pendentes no ShareModal se estiver aberto
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
              // Atualiza membros no ShareModal se estiver aberto
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
            table: 'todos',
            ...(selectedProjectId ? { filter: `project_id=eq.${selectedProjectId}` } : {}),
          },
          () => fetchTasks(false)
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
            if (selectedProjectId) {
              fetchSections();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'task_view_groups' },
          () => fetchTasks()
        )
        .subscribe();

      const handleProjectsUpdated = () => {
        fetchProjects();
      };
      const handleTasksUpdated = () => {
        fetchTasks();
      };
      const handleInviteProcessed = () => {
        fetchPendingInvites();
      };
      window.addEventListener('projects_updated', handleProjectsUpdated);
      window.addEventListener('tasks-updated', handleTasksUpdated);
      window.addEventListener('invite_processed', handleInviteProcessed);

      return () => {
        client.removeChannel(channel);
        window.removeEventListener('projects_updated', handleProjectsUpdated);
        window.removeEventListener('tasks-updated', handleTasksUpdated);
        window.removeEventListener('invite_processed', handleInviteProcessed);
      };
    }
  }, [user, selectedProjectId]);

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
      setSections([]);
    }
  }, [user, selectedProjectId]);

  const fetchGroups = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data } = await client
      .from('view_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at');

    if (data) setGroups(data as Group[]);
  };

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
      const initialExpanded: Record<number, boolean> = {};
      data.forEach((s: Section) => { initialExpanded[s.id] = true; });
      setExpandedSections(initialExpanded);
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
        alert(result.error);
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
      alert(`Erro ao aceitar convite: ${result.error}`);
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

  const handleAddTask = async (sectionId?: number, titleParam?: string, groupOverrideId?: number) => {
    const raw = (titleParam ?? newTaskTitle).trim();
    if (!raw || !user) return;

    const titles = raw.split('\n').map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) return;

    const effectiveGroupId = groupOverrideId ?? (selectedGroupId && !selectedProjectId ? parseInt(selectedGroupId) : undefined);
    
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
      description: null,
      priority: null,
      status: 'a_fazer',
      creator_name: (user as any).user_metadata?.full_name || user.email,
    } as Task));

    setTasks(prev => [...newOptimisticTasks, ...prev]);
    if (!titleParam) setNewTaskTitle('');

    const results = await Promise.all(titles.map(title => 
      taskAPI.createTask(
        user.id,
        title,
        selectedProjectId ? parseInt(selectedProjectId) : undefined,
        sectionId,
        effectiveGroupId
      )
    ));

    // Se houve erro, re-faz fetch
    if (results.some(r => !r.success)) {
      await fetchTasks();
    } else {
      // Atualiza IDs temporarios pelos reais
      setTasks(prev => {
        const next = [...prev];
        results.forEach((res, i) => {
          if (res.success && res.data) {
            const idx = next.findIndex(t => t.id === newOptimisticTasks[i].id);
            if (idx !== -1) next[idx] = res.data;
          }
        });
        return next;
      });
    }
  };

  const toggleTask = async (task: Task) => {
    // OPTIMISTIC UPDATE
    const newState = !task.is_completed;
    setTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, is_completed: newState } : t
    ));

    const result = await taskAPI.toggleTaskCompletion(task.id, task.is_completed);
    if (!result.success) {
      // Revert on error
      setTasks(prev => prev.map(t =>
        t.id === task.id ? { ...t, is_completed: !newState } : t
      ));
      await fetchTasks();
    }
  };

  const deleteTask = async (taskId: number) => {
    // OPTIMISTIC UPDATE
    const taskToDelete = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));

    const result = await taskAPI.deleteTask(taskId);
    if (!result.success && taskToDelete) {
      // Revert on error
      setTasks(prev => [...prev, taskToDelete]);
      await fetchTasks();
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
      setSections(prev => [...prev, data as Section]);
      setExpandedSections(prev => ({ ...prev, [data.id]: true }));
    }
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
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    }
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

  const filteredTasks = tasks.filter(t => {
    if (onlyToday) {
      const today = new Date().toISOString().split('T')[0];
      if (t.due_date !== today) return false;
    }
    if (!showCompleted && t.is_completed) return false;
    if (selectedProjectId) return t.project_id === parseInt(selectedProjectId);
    if (selectedGroupId) {
      // Mostra tarefas com view_group_id direto OU vinculadas via task_view_groups
      if (t.view_group_id === parseInt(selectedGroupId)) return true;
      if (t.linked_view_group_ids?.includes(parseInt(selectedGroupId))) return true;
      return false;
    }
    return true;
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
        title: group?.title ?? 'Sem Categoria',
        color: group?.color ?? null,
        link: `/?group=${id}`,
      };
    }

    return { title: 'Sem Categoria', color: null, link: null };
  };

  // Ordena as seções: Caixa de Entrada primeiro, depois projetos, depois blocos/listas
  const sortedGroupKeys = (Object.keys(groupedTasks) as GroupKey[]).sort((a, b) => {
    if (a === 'inbox') return -1;
    if (b === 'inbox') return 1;
    if (a.startsWith('project:') && !b.startsWith('project:')) return -1;
    if (!a.startsWith('project:') && b.startsWith('project:')) return 1;
    return a.localeCompare(b);
  });

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggingTaskId(task.id);
    e.dataTransfer.setData('taskId', task.id.toString());
    e.dataTransfer.setData('taskTitle', task.title);
    e.dataTransfer.setData('sourceSectionId', (task.section_id ?? '').toString());
    e.dataTransfer.setData('sourceProjectId', (task.project_id ?? '').toString());
    e.dataTransfer.setData('sourceGroupId', (selectedGroupId || '').toString());
    e.dataTransfer.effectAllowed = 'move';

    // Custom drag ghost (imagem fantasma)
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.position = 'absolute';
    ghost.style.top = '-10000px';
    ghost.style.left = '-10000px';
    ghost.style.width = `${rect.width}px`;
    ghost.style.opacity = '0.85';
    ghost.style.borderRadius = '8px';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
    ghost.style.border = '2px solid #6366f1';
    ghost.style.backgroundColor = 'var(--card)';
    ghost.style.transform = 'rotate(2deg) scale(1.02)';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverSectionId(null);
    setDragOverTaskId(null);
    setDropPosition(null);
    setDragOverStatusGroup(null);
  };

  const handleDragOverSection = (e: React.DragEvent, sectionId: number | 'unsectioned') => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSectionId(sectionId);
  };

  const handleDragLeaveSection = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverSectionId(null);
      setDragOverTaskId(null);
      setDropPosition(null);
      setDragOverStatusGroup(null);
    }
  };

  const handleDragOverStatusGroup = (e: React.DragEvent, sectionId: number | null, statusKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSectionId(sectionId === null ? 'unsectioned' : sectionId);
    setDragOverStatusGroup(statusKey);
  };

  const handleDragLeaveStatusGroup = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverStatusGroup(null);
    }
  };

  const handleTaskDragOver = (e: React.DragEvent, task: Task) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTaskId(task.id);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDropPosition(y < rect.height / 2 ? 'before' : 'after');
  };

  const handleTaskDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  };

  const handleDropOnSection = async (e: React.DragEvent, sectionId: number | null) => {
    e.preventDefault();
    e.stopPropagation();

    const taskIdStr = e.dataTransfer.getData('taskId');
    if (!taskIdStr || !user || !selectedProjectId) {
      handleDragEnd();
      return;
    }

    const taskId = parseInt(taskIdStr);
    const targetTasks = sectionId === null
      ? getTasksBySection(null).filter(t => t.id !== taskId)
      : getTasksBySection(sectionId).filter(t => t.id !== taskId);

    let insertIndex = targetTasks.length;
    if (dragOverTaskId) {
      const idx = targetTasks.findIndex(t => t.id === dragOverTaskId);
      if (idx !== -1) {
        insertIndex = dropPosition === 'before' ? idx : idx + 1;
      }
    }
    insertIndex = Math.max(0, Math.min(insertIndex, targetTasks.length));

    // Drop animation highlight
    setDroppedTaskId(taskId);
    setTimeout(() => setDroppedTaskId(null), 600);

    // OPTIMISTIC UPDATE: move task to new section in local state immediately
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, section_id: sectionId } : t
    ));

    // Reset all drag state immediately (clears opacity/ghost styles)
    setDraggingTaskId(null);
    setDragOverSectionId(null);
    setDragOverTaskId(null);
    setDropPosition(null);
    setDragOverStatusGroup(null);

    // Persist to database and reconcile in background
    const result = await taskAPI.moveTaskAndReorder(taskId, sectionId, insertIndex, parseInt(selectedProjectId));
    if (!result.success) {
      await fetchTasks(false); // Revert on error
    } else {
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    }
  };

  const handleDropOnStatusGroup = async (e: React.DragEvent, sectionId: number | null, statusKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    const taskIdStr = e.dataTransfer.getData('taskId');
    if (!taskIdStr || !user || !selectedProjectId) {
      handleDragEnd();
      return;
    }

    const taskId = parseInt(taskIdStr);

    const targetTasks = getTasksBySectionAndStatus(sectionId, statusKey)
      .filter(t => t.id !== taskId);

    let insertIndex = targetTasks.length;
    if (dragOverTaskId) {
      const idx = targetTasks.findIndex(t => t.id === dragOverTaskId);
      if (idx !== -1) {
        insertIndex = dropPosition === 'before' ? idx : idx + 1;
      }
    }
    insertIndex = Math.max(0, Math.min(insertIndex, targetTasks.length));

    setDroppedTaskId(taskId);
    setTimeout(() => setDroppedTaskId(null), 600);

    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, section_id: sectionId, status: statusKey } : t
    ));

    setDraggingTaskId(null);
    setDragOverSectionId(null);
    setDragOverTaskId(null);
    setDropPosition(null);
    setDragOverStatusGroup(null);

    const result1 = await taskAPI.moveTaskAndReorder(taskId, sectionId, insertIndex, parseInt(selectedProjectId));
    const result2 = await taskAPI.updateTask(taskId, { status: statusKey });
    
    if (!result1.success || !result2.success) {
      await fetchTasks(false);
    } else {
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    }
  };

  const renderTaskItem = (task: Task, sectionId?: number, currentGroupId?: number) => {
    const isDragOverTarget = dragOverTaskId === task.id && draggingTaskId !== task.id;
    const currentGroup = currentGroupId ? groups.find(g => g.id === currentGroupId) : null;
    const timeDisplay = currentGroup?.start_time ? currentGroup.start_time.substring(0, 5) : null;
    const dateDisplay = task.due_date && isToday(task.due_date) ? 'hoje' : null;

    return (
      <div key={task.id} className="relative group/task">
        {isDragOverTarget && dropPosition === 'before' && (
          <div className="absolute -top-[2px] left-3 right-3 h-[3px] bg-primary rounded-full z-20" />
        )}

        <div
          draggable
          onDragStart={(e) => handleDragStart(e, task)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleTaskDragOver(e, task)}
          onDragLeave={handleTaskDragLeave}
          className={cn(
            "flex items-center gap-[10px] py-[9px] px-[14px] border-b border-border/40 last:border-b-0 cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-colors",
            draggingTaskId === task.id && "opacity-50 scale-[0.97]",
            droppedTaskId === task.id && "animate-in fade-in zoom-in-95 duration-500"
          )}
        >
          {/* 6-dot drag handle */}
          <svg
            width="10" height="12" viewBox="0 0 10 12" fill="#cbd5e1"
            className="flex-shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity"
          >
            <circle cx="3" cy="2.5" r="1"/><circle cx="7" cy="2.5" r="1"/>
            <circle cx="3" cy="6" r="1"/><circle cx="7" cy="6" r="1"/>
            <circle cx="3" cy="9.5" r="1"/><circle cx="7" cy="9.5" r="1"/>
          </svg>

          {/* Circular checkbox */}
          <button
            onClick={() => toggleTask(task)}
            className="flex-shrink-0 flex items-center justify-center transition-colors hover:scale-110"
            style={{
              width: 15, height: 15, borderRadius: '50%',
              border: task.is_completed ? 'none' : '1.5px solid #cbd5e1',
              background: task.is_completed ? '#22c55e' : 'transparent',
            }}
          >
            {task.is_completed && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 4.5L3 6.5L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          {/* Task title */}
          <button
            onClick={() => setSelectedTask(task)}
            className={cn(
              "flex-1 text-[13px] text-left truncate bg-transparent border-none p-0 cursor-pointer hover:text-primary transition-colors min-w-0",
              task.is_completed ? "line-through text-slate-400" : "text-slate-800"
            )}
          >
            {task.title}
          </button>

          {/* Creator avatar (only for shared tasks) */}
          {task.creator_name && task.creator_name !== user?.email && (
            <div
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: getColorFromString(task.creator_name) }}
              title={task.creator_name}
            >
              {getInitials(task.creator_name)}
            </div>
          )}

          {/* Time / date indicator */}
          {(timeDisplay || dateDisplay) && (
            <span className="text-[10px] font-semibold text-orange-500 flex-shrink-0">
              {timeDisplay ?? dateDisplay}
            </span>
          )}

          {/* Status badge */}
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0",
            (!task.status || task.status === 'a_fazer') && "bg-slate-100 text-slate-500",
            task.status === 'em_andamento' && "bg-blue-50 text-blue-600",
            task.status === 'concluida' && "bg-green-50 text-green-600",
          )}>
            {(!task.status || task.status === 'a_fazer') ? 'A fazer' :
             task.status === 'em_andamento' ? 'Em andamento' : 'Concluído'}
          </span>

          {/* Remove from group */}
          {currentGroupId && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                // OPTIMISTIC UPDATE
                setTasks(prev => prev.map(t =>
                  t.id === task.id ? {
                    ...t,
                    view_group_id: t.view_group_id === currentGroupId ? null : t.view_group_id,
                    linked_view_group_ids: t.linked_view_group_ids?.filter(id => id !== currentGroupId) || []
                  } : t
                ));
                
                const result = await taskAPI.removeTaskFromGroup(task.id, currentGroupId);
                if (!result.success) {
                  await fetchTasks(false);
                }
              }}
              title="Remover deste bloco/lista"
              className="flex-shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity text-slate-300 hover:text-orange-400"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete */}
          <button
            onClick={() => deleteTask(task.id)}
            className="flex-shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity text-slate-300 hover:text-red-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {isDragOverTarget && dropPosition === 'after' && (
          <div className="absolute -bottom-[2px] left-3 right-3 h-[3px] bg-primary rounded-full z-20" />
        )}
      </div>
    );
  };

  const renderStatusGroups = (sectionId: number | null) => {
    return STATUS_GROUPS.flatMap(group => {
      const groupTasks = getTasksBySectionAndStatus(sectionId, group.key);
      if (groupTasks.length === 0) return [];

      const isHovered = (sectionId === null ? dragOverSectionId === 'unsectioned' : dragOverSectionId === sectionId)
        && dragOverStatusGroup === group.key;

      return (
        <div key={group.key}>
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 border-b border-border/40 text-xs font-medium uppercase tracking-wider",
              isHovered ? "bg-primary/5 text-primary" : "text-muted-foreground/60"
            )}
            onDragOver={(e) => handleDragOverStatusGroup(e, sectionId, group.key)}
            onDragLeave={handleDragLeaveStatusGroup}
            onDrop={(e) => handleDropOnStatusGroup(e, sectionId, group.key)}
          >
            <span>{group.label}</span>
            <span className="text-muted-foreground/40 font-normal normal-case ml-1">
              ({groupTasks.length})
            </span>
          </div>
          {groupTasks.map((task) => renderTaskItem(task, sectionId ?? undefined))}
        </div>
      );
    });
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  const todayDisplay = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date()).replace(/^./, c => c.toUpperCase());

  const pageTitle = selectedProject ? selectedProject.name : selectedGroup ? selectedGroup.title : 'Dashboard';

  return (
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

      {/* Sticky topbar */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{pageTitle}</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{todayDisplay}</p>
          </div>
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
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <div
                onClick={() => setShowCompleted(!showCompleted)}
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

      {/* Dashed task input */}
      <div className="mb-5 bg-card rounded-[10px] border border-dashed border-slate-300">
        <div className="flex items-center gap-3 px-4 py-3">
          <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); }
            }}
            onPaste={async (e) => {
              const text = e.clipboardData.getData('text');
              const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
              if (lines.length > 1) {
                e.preventDefault();
                for (const title of lines) {
                  await taskAPI.createTask(
                    user.id, title,
                    selectedProjectId ? parseInt(selectedProjectId) : undefined,
                    undefined,
                    selectedGroupId && !selectedProjectId ? parseInt(selectedGroupId) : undefined
                  );
                }
                await fetchTasks();
              }
            }}
            placeholder="Nova tarefa — pressione Enter para adicionar"
            className="flex-1 text-[13px] text-slate-500 placeholder:text-slate-400 bg-transparent outline-none"
          />
          <button
            onClick={() => handleAddTask()}
            className="text-slate-300 hover:text-primary transition-colors flex-shrink-0"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pb-2.5 flex items-center gap-1.5">
          <span className="text-[11px]">💡</span>
          <span className="text-[11px] text-amber-600">Cole uma lista e crie várias tarefas de uma vez</span>
        </div>
      </div>

      {/* MODO PROJETO: Seções expansíveis */}
      {selectedProject ? (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : sections.length === 0 && getProjectTasks().length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <p>Nenhuma organização encontrada neste projeto.</p>
              <p className="text-sm mt-2">Clique em "+ Nova organização" para começar.</p>
            </div>
          ) : (
            <>
              {/* Lista de Seções */}
              {sections.map((section) => (
                <Card
                  key={section.id}
                  className={cn(
                    "bg-card border-border overflow-hidden shadow-card transition-all duration-200",
                    dragOverSectionId === section.id && "ring-2 ring-primary/40 bg-primary/5 shadow-card-hover"
                  )}
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
                        <span className="text-sm font-semibold">{section.title}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        ({getTasksBySection(section.id).length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingSection(section.id); setEditingSectionTitle(section.title); }}
                        className="h-8 w-8 text-muted-foreground/50 hover:text-primary"
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
                    <div
                      className="border-t border-border/50 min-h-[48px] transition-all duration-200"
                      onDragOver={(e) => handleDragOverSection(e, section.id)}
                      onDragLeave={handleDragLeaveSection}
                      onDrop={(e) => handleDropOnSection(e, section.id)}
                    >
                      {renderStatusGroups(section.id)}
                      {/* Input para nova tarefa na seção */}
                      <div className="px-10 py-2">
                        <Input
                          placeholder="Adicionar tarefa..."
                          className="h-8 text-sm bg-transparent border-none shadow-none focus-visible:ring-0 px-0"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              const title = e.currentTarget.value.trim();
                              e.currentTarget.value = '';
                              handleAddTask(section.id, title);
                            }
                          }}
                          onPaste={async (e) => {
                            const text = e.clipboardData.getData('text');
                            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                            if (lines.length > 1) {
                              e.preventDefault();
                              for (const title of lines) {
                                await taskAPI.createTask(
                                  user.id,
                                  title,
                                  selectedProjectId ? parseInt(selectedProjectId) : undefined,
                                  section.id,
                                  selectedGroupId && !selectedProjectId ? parseInt(selectedGroupId) : undefined
                                );
                              }
                              await fetchTasks();
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              ))}

              {/* Tarefas sem seção */}
              <Card
                  className={cn(
                    "bg-card border-border overflow-hidden shadow-card transition-all duration-200",
                    dragOverSectionId === 'unsectioned' && "ring-2 ring-primary/40 bg-primary/5 shadow-card-hover"
                  )}
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
                    <div className="flex items-center gap-3">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Sem organização</span>
                      <span className="text-xs text-muted-foreground">
                        ({getTasksBySection(null).length})
                      </span>
                    </div>
                  </div>
                  <div
                    className="min-h-[48px] transition-all duration-200"
                    onDragOver={(e) => handleDragOverSection(e, 'unsectioned')}
                    onDragLeave={handleDragLeaveSection}
                    onDrop={(e) => handleDropOnSection(e, null)}
                  >
                    {renderStatusGroups(null)}
                    {getTasksBySection(null).length === 0 && (
                      <div className="px-4 py-3 text-xs text-muted-foreground/50 text-center italic">
                        Solte tarefas aqui para removê-las da organização
                      </div>
                    )}
                    <div className="px-4 py-2 border-t border-border/40">
                      <Input
                        placeholder="Adicionar tarefa..."
                        className="h-8 text-sm bg-transparent border-none shadow-none focus-visible:ring-0 px-0"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            const title = e.currentTarget.value.trim();
                            e.currentTarget.value = '';
                            handleAddTask(undefined, title);
                          }
                        }}
                      />
                    </div>
                  </div>
                </Card>

              {/* Botão nova seção */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const title = prompt('Nome da nova organização:');
                    if (title?.trim()) { createSection(title.trim()); }
                  }}
                  className="text-primary hover:bg-primary/10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nova organização
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
            /* Cabeçalho para cada grupo quando não tem grupo selecionado */
            <>
              {!selectedGroup && sortedGroupKeys.map((groupId) => {
                const groupInfo = getGroupInfo(groupId);
                const groupTasks = groupedTasks[groupId];
                if (!groupTasks || groupTasks.length === 0) return null;
                const pendingCount = groupTasks.filter(t => !t.is_completed).length;
                return (
                  <div key={groupId} className="mb-5">
                    {/* DS group header: 3px bar | name | count pill | Ver → */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-[3px] h-[15px] rounded-full flex-shrink-0"
                          style={{ backgroundColor: groupInfo.color || 'hsl(var(--primary))' }}
                        />
                        <span
                          className="text-[13px] font-semibold"
                          style={groupInfo.color ? { color: groupInfo.color } : undefined}
                        >
                          {groupInfo.title}
                        </span>
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full tabular-nums">
                          {pendingCount}
                        </span>
                      </div>
                      {groupInfo.link && (
                        <button
                          onClick={() => router.push(groupInfo.link!)}
                          className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors"
                        >
                          Ver <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="border border-border rounded-[10px] overflow-hidden bg-card shadow-xs">
                      {groupTasks.map((task) => renderTaskItem(task, undefined, groupId.startsWith('group:') ? parseInt(groupId.split(':')[1]) : undefined))}
                      {groupId.startsWith('group:') && (
                        <div className="flex items-center gap-2 px-[14px] py-2 border-t border-border/40">
                          <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <input
                            placeholder="Adicionar tarefa..."
                            className="flex-1 text-[12px] text-slate-500 placeholder:text-slate-400 bg-transparent outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                const title = e.currentTarget.value.trim();
                                e.currentTarget.value = '';
                                handleAddTask(undefined, title, parseInt(groupId.split(':')[1]));
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Quando tem grupo selecionado: lista compacta única */}
              {selectedGroup && (
                <div className="border border-border rounded-[10px] overflow-hidden bg-card shadow-xs">
                  {filteredTasks.map((task) => renderTaskItem(task, undefined, selectedGroup.id))}
                  <div className="flex items-center gap-2 px-[14px] py-2 border-t border-border/40">
                    <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <input
                      placeholder="Adicionar tarefa..."
                      className="flex-1 text-[12px] text-slate-500 placeholder:text-slate-400 bg-transparent outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          const title = e.currentTarget.value.trim();
                          e.currentTarget.value = '';
                          handleAddTask(undefined, title);
                        }
                      }}
                    />
                  </div>
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
          onClose={() => setSelectedTask(null)}
          onUpdate={(updatedTask) => {
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
            setSelectedTask(updatedTask);
          }}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Carregando...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
