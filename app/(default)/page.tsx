'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X, GripVertical, Star, ArrowRight, XCircle, Plus, ChevronDown, Edit2, Trash2, Folder, Share, User, Search, Target, Wallet } from 'lucide-react';
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

function DashboardContent() {
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
      fetchTasks();
      fetchPendingInvites();
      
      // Inscrição para atualizações em tempo real
      const channel = client
        .channel('dashboard-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'project_invites', filter: `invited_user_id=eq.${user.id}` },
          () => fetchPendingInvites()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'project_members', filter: `user_id=eq.${user.id}` },
          () => fetchProjects()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projects' },
          () => fetchProjects()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` },
          () => fetchTasks()
        )
        .subscribe();

      const handleProjectsUpdated = () => {
        fetchProjects();
      };
      const handleTasksUpdated = () => {
        fetchTasks();
      };
      window.addEventListener('projects_updated', handleProjectsUpdated);
      window.addEventListener('tasks-updated', handleTasksUpdated);

      return () => {
        client.removeChannel(channel);
        window.removeEventListener('projects_updated', handleProjectsUpdated);
        window.removeEventListener('tasks-updated', handleTasksUpdated);
      };
    }
  }, [user]);

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

  const fetchProjects = async () => {
    if (!user) return;
    const allProjects = await projectAPI.getUserProjects(user.id);
    setProjects(allProjects);
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

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    const data = await taskAPI.getUserTasks(user.id, { showCompleted: true });
    setTasks(data);
    setLoading(false);
  };

  const fetchPendingInvites = async () => {
    if (!user) return;
    const invites = await notificationAPI.getPendingInvites(user.id);
    setPendingInvites(invites);
    if (invites.length > 0) {
      setShowInviteModal(true);
    }
    setInvitesLoaded(true);
  };

  const acceptInvite = async (inviteId: number, projectId: number) => {
    if (!user) return;
    await notificationAPI.acceptInvite(inviteId, projectId, user.id);
    fetchProjects();
    window.dispatchEvent(new CustomEvent('projects_updated'));
    setPendingInvites(pendingInvites.filter(inv => inv.id !== inviteId));
    if (pendingInvites.length <= 1) setShowInviteModal(false);
  };

  const declineInvite = async (inviteId: number) => {
    await notificationAPI.declineInvite(inviteId);
    setPendingInvites(pendingInvites.filter(inv => inv.id !== inviteId));
    if (pendingInvites.length <= 1) setShowInviteModal(false);
  };

  const handleAddTask = async (sectionId?: number) => {
    const title = newTaskTitle.trim();
    if (!title || !user) return;

    const result = await taskAPI.createTask(
      user.id,
      title,
      selectedProjectId ? parseInt(selectedProjectId) : undefined,
      sectionId,
      selectedGroupId && !selectedProjectId ? parseInt(selectedGroupId) : undefined
    );

    if (result.success) {
      setNewTaskTitle('');
      await fetchTasks();
    }
  };

  const toggleTask = async (task: Task) => {
    await taskAPI.toggleTaskCompletion(task.id, task.is_completed);
    await fetchTasks();
  };

  const deleteTask = async (taskId: number) => {
    await taskAPI.deleteTask(taskId);
    await fetchTasks();
  };

  const createSection = async (title: string) => {
    if (!title.trim() || !user || !selectedProjectId) return;
    const { data } = await client
      .from('sections')
      .insert({
        user_id: user.id,
        project_id: parseInt(selectedProjectId),
        title: title.trim(),
        order: sections.length,
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
    // Garante que as tarefas voltem para a Caixa de Entrada (sem seção).
    // O banco já tem ON DELETE SET NULL, mas limpamos explicitamente como defesa em profundidade.
    await taskAPI.clearTasksFromSection(sectionId);
    await client.from('sections').delete().eq('id', sectionId);
    setSections(sections.filter(s => s.id !== sectionId));
    await fetchTasks();
    window.dispatchEvent(new CustomEvent('tasks-updated'));
  };

  const deleteProject = async () => {
    if (!selectedProject || !user || selectedProject.owner_id !== user.id) return;
    if (!confirm(`Excluir "${selectedProject.name}"? As tarefas associadas voltarão para a Caixa de Entrada.`)) return;
    // Garante que as tarefas voltem para a Caixa de Entrada (sem projeto e sem seção).
    await taskAPI.clearTasksFromProject(selectedProject.id);
    await client.from('projects').delete().eq('id', selectedProject.id);
    setProjects(projects.filter(p => p.id !== selectedProject.id));
    window.dispatchEvent(new CustomEvent('projects_updated'));
    await fetchTasks();
    window.dispatchEvent(new CustomEvent('tasks-updated'));
    router.push('/');
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

  const filteredTasks = tasks.filter(t => {
    if (onlyToday) {
      const today = new Date().toISOString().split('T')[0];
      if (t.due_date !== today) return false;
    }
    if (!showCompleted && t.is_completed) return false;
    if (selectedProjectId) return t.project_id === parseInt(selectedProjectId);
    if (selectedGroupId) return t.view_group_id === parseInt(selectedGroupId);
    return true;
  });

  const filteredShareUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUsers.toLowerCase())
  );

  // Tipos de agrupamento para o Dashboard
  type GroupKey = string; // Pode ser 'inbox' | 'group:<id>' | 'project:<id>'

  // Chave única e estável para cada tarefa com base em sua associação real no banco
  const getTaskGroupKey = (task: Task): GroupKey => {
    if (task.project_id != null) return `project:${task.project_id}`;
    if (task.view_group_id != null) return `group:${task.view_group_id}`;
    return 'inbox';
  };

  const groupedTasks = filteredTasks.reduce((acc: Record<string, Task[]>, task) => {
    const key = getTaskGroupKey(task);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(task);
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
    e.dataTransfer.effectAllowed = 'move';
    
    // Pequeno atraso para a classe de opacidade ser aplicada após o início do drag
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingTaskId(null);
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
  };

  const renderTaskItem = (task: Task, sectionId?: number) => (
    <div
      key={task.id}
      draggable
      onDragStart={(e) => handleDragStart(e, task)}
      onDragEnd={handleDragEnd}
      className={cn(
        "flex items-center gap-3 py-2 px-2 hover:bg-accent/5 transition-all group border-b border-accent/10 last:border-b-0 cursor-grab active:cursor-grabbing",
        draggingTaskId === task.id && "opacity-40 bg-accent/10 scale-[0.98] shadow-inner"
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
      <Checkbox
        checked={task.is_completed}
        onCheckedChange={() => toggleTask(task)}
      />
      <span className={cn('flex-1 text-sm', task.is_completed && 'line-through text-muted-foreground')}>
        {task.title}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground/50 hover:text-yellow-500"
      >
        <Star className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => deleteTask(task.id)}
        className="h-7 w-7 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
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

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">
            {selectedProject ? selectedProject.name : selectedGroup ? selectedGroup.title : 'Dashboard'}
          </h1>
          {(selectedGroup || selectedProject) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/')}
              className="rounded-full h-8"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Limpar filtro
            </Button>
          )}
          {selectedProject && user && selectedProject.owner_id === user.id && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openShareModal}
                className="rounded-full"
              >
                <Share className="w-4 h-4 mr-2" />
                Compartilhar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteProject}
                className="rounded-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mostrar Concluídas</span>
            <Checkbox
              checked={showCompleted}
              onCheckedChange={(checked) => setShowCompleted(!!checked)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Apenas Atuais</span>
            <Checkbox
              checked={onlyToday}
              onCheckedChange={(checked) => setOnlyToday(!!checked)}
            />
          </div>
        </div>
      </div>

      {/* Input adicionar tarefa */}
      <div className="relative mb-8">
        <Input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddTask();
            }
          }}
          placeholder="O que precisa ser feito?"
          className="pr-12 h-12 text-base shadow-sm"
        />
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
          onClick={() => handleAddTask()}
        >
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>

      {/* MODO PROJETO: Seções expansíveis */}
      {selectedProject ? (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : sections.length === 0 && getProjectTasks().length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <p>Nenhuma seção encontrada neste projeto.</p>
              <p className="text-sm mt-2">Clique em "+ Nova seção" para começar.</p>
            </div>
          ) : (
            <>
              {/* Lista de Seções */}
              {sections.map((section) => (
                <Card key={section.id} className="bg-accent/5 border-accent/20 overflow-hidden shadow-none">
                  {/* Header da seção */}
                  <div
                    className="flex items-center justify-between px-4 py-2 border-b border-accent/20 cursor-pointer hover:bg-accent/10 transition-colors"
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
                    <div className="border-t border-accent/20">
                      {getTasksBySection(section.id).map((task) => renderTaskItem(task, section.id))}
                      {/* Input para nova tarefa na seção */}
                      <div className="px-10 py-2">
                        <Input
                          placeholder="Adicionar tarefa..."
                          className="h-8 text-sm bg-transparent border-none shadow-none focus-visible:ring-0 px-0"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              setNewTaskTitle(e.currentTarget.value.trim());
                              handleAddTask(section.id);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              ))}

              {/* Tarefas sem seção */}
              {getTasksBySection(null).length > 0 && (
                <Card className="bg-accent/5 border-accent/20 overflow-hidden shadow-none">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-accent/20">
                    <div className="flex items-center gap-3">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Sem seção</span>
                      <span className="text-xs text-muted-foreground">
                        ({getTasksBySection(null).length})
                      </span>
                    </div>
                  </div>
                  {getTasksBySection(null).map((task) => renderTaskItem(task))}
                </Card>
              )}

              {/* Botão nova seção */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const title = prompt('Nome da nova seção:');
                    if (title?.trim()) { createSection(title.trim()); }
                  }}
                  className="text-primary hover:bg-primary/10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nova seção
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
                return (
                  <div key={groupId} className="mb-4">
                    <div className="flex items-center justify-between px-1 py-2">
                      <span
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        style={groupInfo.color ? { color: groupInfo.color } : undefined}
                      >
                        {groupInfo.title}
                      </span>
                      {groupInfo.link && (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => router.push(groupInfo.link!)}
                          className="h-auto p-0 text-xs"
                        >
                          Selecionar
                        </Button>
                      )}
                    </div>
                    <div className="border border-accent/20 rounded-lg overflow-hidden bg-accent/5">
                      {groupTasks.map((task) => renderTaskItem(task))}
                    </div>
                  </div>
                );
              })}

              {/* Quando tem grupo selecionado: lista compacta única */}
              {selectedGroup && (
                <div className="border border-accent/20 rounded-lg overflow-hidden bg-accent/5">
                  {filteredTasks.map((task) => renderTaskItem(task))}
                </div>
              )}
            </>
          )}
        </div>
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
