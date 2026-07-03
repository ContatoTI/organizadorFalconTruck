'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn, GroupIcon, PROJECT_COLORS } from '@/app/lib/utils';
import { useGroups } from '@/app/lib/GroupsContext';
import { projectAPI } from '@/app/lib/projectAPI';
import { notificationAPI } from '@/app/lib/notificationAPI';
import { taskAPI } from '@/app/lib/taskAPI';
import { NotificationBell, NotificationsPanel } from '@/app/components/NotificationsPanel';
import { ProfileDialog } from '@/app/components/ProfileDialog';
import { ProjectsView } from '@/app/components/ProjectsView';
import type { Project } from '@/types/index';
import {
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Target,
  Wallet,
  CheckSquare,
  LogIn,
  Plus,
  Settings,
  LogOut,
  ChevronRight,
  Folder,
  X,
  Bell,
  Check,
  Clock,
  List,
  Trash2,
  User,
  Eye,
  EyeOff,
  Menu,
} from 'lucide-react';

function DefaultLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeGroupId = searchParams.get('group');
  const activeProjectId = searchParams.get('project');
  const isDashboardRoot = pathname === '/' && !activeGroupId && !activeProjectId;
  const [user, setUser] = useState<any>(null);
  const { groups, loading: loadingGroups, refreshGroups, deleteGroup: deleteGroupFromState, updateGroup } = useGroups();
  const client = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    projetos: true,
    planejamento: true,
    listas: true,
    blocos: true,
  });
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#6366f1');
  const [showProjectsView, setShowProjectsView] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [declineNotifications, setDeclineNotifications] = useState<any[]>([]);
  const userRef = useRef(user);
  const projectsRef = useRef<Project[]>(projects);
  const pendingInvitesRef = useRef(pendingInvites);
  const declineNotificationsRef = useRef(declineNotifications);
  userRef.current = user;
  projectsRef.current = projects;
  pendingInvitesRef.current = pendingInvites;
  declineNotificationsRef.current = declineNotifications;

  const togglingVisibilityRef = useRef<Set<number>>(new Set());
  const fetchProjectsRef = useRef<() => Promise<void>>(async () => {});
  const mergeProjectsRef = useRef<(serverProjects: Project[]) => void>(() => {});
  const fetchNotificationsRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setShowProjectsView(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await client.auth.getUser();
      setUser(user);
    };
    getUser();

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listener sempre ativo (não depende de user) - garante que eventos sejam ouvidos
  useEffect(() => {
    const handleProjectsUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Se o evento carregar dados do projeto recém-aceito, insere imediatamente no estado local
      if (detail?.projectId) {
        setProjects((prev) => {
          if (prev.some((p) => p.id === detail.projectId)) return prev;
          return [...prev, {
          id: detail.projectId,
          owner_id: '',
          name: detail.name || 'Projeto',
          color: detail.color || '#6366f1',
          show_on_dashboard: true,
        }];
        });
      }
      fetchProjectsRef.current();
    };
    const handleInviteProcessed = () => {
      fetchNotificationsRef.current();
    };

    window.addEventListener('projects_updated', handleProjectsUpdated);
    window.addEventListener('invite_processed', handleInviteProcessed);

    return () => {
      window.removeEventListener('projects_updated', handleProjectsUpdated);
      window.removeEventListener('invite_processed', handleInviteProcessed);
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchProjects();
      fetchNotifications();
      subscribeToChanges();
    } else {
      setProjects([]);
      setLoadingProjects(false);
      setPendingInvites([]);
      setDeclineNotifications([]);
    }

    return () => {
      client.channel('sidebar-changes').unsubscribe();
    };
  }, [user]);

  const fetchNotifications = async () => {
    const curUser = userRef.current;
    if (!curUser) return;

    try {
      const { pendingInvites: invites, declineNotifications: declined } =
        await notificationAPI.getUserNotifications(curUser.id);

      setPendingInvites(invites);
      setDeclineNotifications(declined);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setPendingInvites([]);
      setDeclineNotifications([]);
    }
  };

  const subscribeToChanges = () => {
    const channel = client.channel('sidebar-changes');

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_invites' },
        () => {
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_members' },
        (payload) => {
          const data = payload.new as any || payload.old as any;
          if (data && data.user_id === userRef.current?.id) {
            fetchProjectsRef.current!();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => {
          const data = payload.new as any || payload.old as any;
          const curUser = userRef.current;
          const curProjects = projectsRef.current;
          if (data && curUser && (
            data.owner_id === curUser.id ||
            curProjects.some(p => p.id === data.id)
          )) {
            fetchProjectsRef.current!();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'view_groups' },
        (payload) => {
          const data = payload.new as any;
          if (data?.id) updateGroup(data.id, data as any);
        }
      )
      .subscribe();
  };

  const acceptInviteFromBell = async (inviteId: number, projectId: number) => {
    const curUser = userRef.current;
    if (!curUser) return;

    const result = await notificationAPI.acceptInvite(inviteId, projectId, curUser.id);

    if (result.success) {
      // Adiciona o projeto ao estado local imediatamente (com ou sem dados da notificação)
      const inviteNotification = pendingInvitesRef.current.find(inv => inv.id === inviteId);
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

      // fetchProjects faz MERGE, então o item local não é sobrescrito,
      // mesmo que o servidor ainda não enxergue o novo vínculo (cache de RLS).
      await fetchProjectsRef.current!();
      await fetchNotifications();
      window.dispatchEvent(new CustomEvent('projects_updated', {
        detail: {
          projectId,
          name: inviteNotification?.project_title || 'Projeto',
          color: inviteNotification?.project_color || '#6366f1',
        },
      }));
      window.dispatchEvent(new CustomEvent('invite_processed'));
    } else {
      console.error('Erro ao aceitar convite pelo sino:', result.error);
    }
  };

  const declineInviteFromBell = async (inviteId: number) => {
    const curUser = userRef.current;
    if (!curUser) return;

    const result = await notificationAPI.declineInvite(inviteId, curUser.id);
    if (!result.success) {
      console.error('[Layout] Erro ao recusar convite:', result.error);
      return;
    }

    fetchNotifications();
    window.dispatchEvent(new CustomEvent('invite_processed'));
  };

  const dismissDeclineNotification = async (inviteId: number) => {
    await client
      .from('project_invites')
      .delete()
      .eq('id', inviteId);

    fetchNotifications();
  };

  const reinviteUser = async (projectId: number, userId: string) => {
    const curUser = userRef.current;
    if (!curUser) return;

    const { error: deleteError } = await client
      .from('project_invites')
      .delete()
      .eq('project_id', projectId)
      .eq('invited_user_id', userId);

    if (deleteError) {
      console.error('[Layout] Erro ao remover convite recusado:', deleteError);
      return;
    }

    const result = await projectAPI.inviteUserToProject(projectId, userId, curUser.id);
    if (!result.success) {
      console.error('[Layout] Erro ao re-convidar usuário:', result.error);
      return;
    }

    fetchNotifications();
  };

  const totalNotifications = pendingInvites.length + declineNotifications.length;

  // Helper para lidar com strings que podem ser JSON ou não
  const getParsedValue = useCallback((val: any) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
    return val;
  }, []);

  // Faz merge dos projetos retornados pelo servidor com o estado local.
  // - Projetos vindos do servidor sobrescrevem entradas locais com mesmo id (atualização).
  // - Projetos que existem apenas localmente (ex: recém-aceito, ainda não visível por RLS) são MANTIDOS.
  // Isso evita que um fetch com cache de RLS obsoleto apague o projeto que acabou de ser aceito.
  const mergeProjects = useCallback((serverProjects: Project[]) => {
    setProjects((prev) => {
      const byId = new Map<number, Project>();
      prev.forEach((p) => byId.set(p.id, p));
      serverProjects.forEach((p) => byId.set(p.id, p));
      return Array.from(byId.values());
    });
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    const curUser = userRef.current;
    if (!curUser) {
      setLoadingProjects(false);
      return;
    }

    try {
      const allProjects = await projectAPI.getUserProjects(curUser.id);
      mergeProjectsRef.current!(allProjects);
    } catch (error) {
      console.error('Erro ao buscar projetos:', error);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  // Manter refs atualizadas para uso em event listeners e subscriptions
  fetchProjectsRef.current = fetchProjects;
  mergeProjectsRef.current = mergeProjects;
  fetchNotificationsRef.current = fetchNotifications;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const deleteGroup = async (group: any) => {
    if (!user || !confirm(`Excluir "${group.title}"? As tarefas associadas voltarão para a Caixa de Entrada.`)) return;

    try {
      // Garante que as tarefas voltem para a Caixa de Entrada (sem bloco/lista).
      // O banco já tem ON DELETE SET NULL, mas limpamos explicitamente como defesa em profundidade.
      await taskAPI.clearTasksFromGroup(group.id);
      await client.from('view_groups').delete().eq('id', group.id);
      deleteGroupFromState(group.id);
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    } catch (error) {
      console.error('Erro ao excluir grupo:', error);
    }
  };

  const toggleGroupVisibility = async (group: any) => {
    if (togglingVisibilityRef.current.has(group.id)) return;
    togglingVisibilityRef.current.add(group.id);
    const next = !group.show_on_dashboard;
    updateGroup(group.id, { show_on_dashboard: next });
    const { error } = await client.from('view_groups').update({ show_on_dashboard: next }).eq('id', group.id);
    if (error) {
      updateGroup(group.id, { show_on_dashboard: group.show_on_dashboard });
    }
    togglingVisibilityRef.current.delete(group.id);
  };

  const toggleProjectVisibility = async (project: any) => {
    if (togglingVisibilityRef.current.has(project.id)) return;
    togglingVisibilityRef.current.add(project.id);
    const next = !project.show_on_dashboard;
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, show_on_dashboard: next } : p));
    const { error } = await client.from('projects').update({ show_on_dashboard: next }).eq('id', project.id);
    if (error) {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, show_on_dashboard: !next } : p));
    }
    togglingVisibilityRef.current.delete(project.id);
  };

  const createProject = async () => {
    if (!newProjectName.trim() || !user) return;

    const result = await projectAPI.createProject(user.id, newProjectName, newProjectColor);

    if (!result.success || !result.data) {
      console.error('Erro ao criar projeto:', result.error);
      return;
    }

    setProjects(prev => [...prev, result.data!]);
    setNewProjectName('');
    setNewProjectColor('#6366f1');
    setShowProjectModal(false);
    window.dispatchEvent(new CustomEvent('projects_updated', {
      detail: {
        projectId: result.data.id,
        name: result.data.name,
        color: result.data.color,
      },
    }));
  };

  const handleLogout = async () => {
    await client.auth.signOut();
    window.location.href = '/login';
  };

  const [isDragOver, setIsDragOver] = useState<number | null>(null);
  const [dragOverType, setDragOverType] = useState<'group' | 'project' | null>(null);

  useEffect(() => {
    const handleDragOverEvent = (e: any) => {
      const { id, type } = e.detail;
      setIsDragOver(id);
      setDragOverType(type);
    };
    const handleDragLeaveEvent = () => {
      setIsDragOver(null);
      setDragOverType(null);
    };

    window.addEventListener('sidebar-drag-over', handleDragOverEvent);
    window.addEventListener('sidebar-drag-leave', handleDragLeaveEvent);
    return () => {
      window.removeEventListener('sidebar-drag-over', handleDragOverEvent);
      window.removeEventListener('sidebar-drag-leave', handleDragLeaveEvent);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (isDragOver !== id) {
      setIsDragOver(id);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(null);
    setDragOverType(null);
  };

  const handleDropOnGroup = (e: React.DragEvent, groupId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(null);
    setDragOverType(null);
    
    const taskIdStr = e.dataTransfer.getData('taskId');
    const taskId = parseInt(taskIdStr);
    if (!taskId || isNaN(taskId)) return;
    
    const sourceProjectId = e.dataTransfer.getData('sourceProjectId');
    const sourceGroupId = e.dataTransfer.getData('sourceGroupId');

    // Atualização otimista imediata
    if (sourceProjectId) {
      if (sourceGroupId) {
        window.dispatchEvent(new CustomEvent('tasks-updated', {
          detail: { optimistic: true, taskId, action: 'relink_group', sourceGroupId: parseInt(sourceGroupId, 10), groupId }
        }));

        (async () => {
          const unlinkResult = await taskAPI.unlinkTaskFromGroup(taskId, parseInt(sourceGroupId, 10));
          if (!unlinkResult.success) { window.dispatchEvent(new CustomEvent('tasks-updated')); return; }
          const linkResult = await taskAPI.linkTaskToGroup(taskId, groupId);
          if (!linkResult.success) { window.dispatchEvent(new CustomEvent('tasks-updated')); }
        })();
      } else {
        window.dispatchEvent(new CustomEvent('tasks-updated', {
          detail: { optimistic: true, taskId, action: 'link_group', groupId }
        }));

        (async () => {
          const result = await taskAPI.linkTaskToGroup(taskId, groupId);
          if (!result.success) { window.dispatchEvent(new CustomEvent('tasks-updated')); }
        })();
      }
    } else {
      window.dispatchEvent(new CustomEvent('tasks-updated', {
        detail: { optimistic: true, taskId, action: 'move_to_group', groupId }
      }));

      (async () => {
        const result = await taskAPI.moveTaskToGroup(taskId, groupId);
        if (!result.success) { window.dispatchEvent(new CustomEvent('tasks-updated')); }
      })();
    }
  };

  const handleDropOnProject = (e: React.DragEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(null);
    setDragOverType(null);
    
    const taskId = parseInt(e.dataTransfer.getData('taskId'));
    if (!taskId || isNaN(taskId)) return;
    
    // Atualização otimista imediata
    window.dispatchEvent(new CustomEvent('tasks-updated', {
      detail: { optimistic: true, taskId, action: 'move_to_project', projectId }
    }));
    
    taskAPI.moveTaskToProject(taskId, projectId)
      .catch(() => window.dispatchEvent(new CustomEvent('tasks-updated')));
  };

  const timeGroups = groups.filter((g) => g.type === 'time');
  const listGroups = groups.filter((g) => g.type === 'list');

  return (
    <div className="flex h-screen bg-background relative">
      {/* Botão hambúrguer - visível apenas em mobile, abre/fecha a sidebar */}
      <button
        onClick={() => setMobileMenuOpen((prev) => !prev)}
        className={cn(
          'fixed top-4 z-50 p-2 rounded-full bg-card border border-border hover:bg-accent transition-colors shadow-card md:hidden',
          mobileMenuOpen ? 'left-[196px]' : 'left-4'
        )}
        aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay de fundo ao abrir a sidebar em mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-foreground/50 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sino de Notificações - fixo no canto superior direito */}
      {user && (
        <div className="fixed top-4 right-4 z-40">
          <NotificationBell
            count={totalNotifications}
            onClick={() => setShowNotifications(!showNotifications)}
          />
          <NotificationsPanel
            isOpen={showNotifications}
            pendingInvites={pendingInvites}
            declineNotifications={declineNotifications}
            onAcceptInvite={acceptInviteFromBell}
            onDeclineInvite={declineInviteFromBell}
            onReinviteUser={reinviteUser}
            onDismissDecline={dismissDeclineNotification}
            onClose={() => setShowNotifications(false)}
          />
        </div>
      )}

      {/* Modal para criar projeto */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-80 shadow-modal border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Novo Projeto</h3>
              <button onClick={() => setShowProjectModal(false)} className="p-1 hover:bg-accent rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Nome do projeto</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Ex: Falcontruck"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewProjectColor(color)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-transform',
                        newProjectColor === color && 'ring-2 ring-offset-2 ring-primary scale-110'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={createProject}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Criar Projeto
              </button>
            </div>
          </div>
        </div>
      )}

      <aside
        className={cn(
          'w-[244px] border-r border-border bg-sidebar flex flex-col',
          'fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0'
        )}
      >
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-muted uppercase tracking-widest mb-0.5">Organizador</p>
              <h1 className="text-base font-semibold text-sidebar-foreground truncate">
                {user
                  ? user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'
                  : 'FalconTruck'}
              </h1>
            </div>
            {user && (
              <button
                onClick={() => setShowProfileDialog(true)}
                className="ml-2 p-2 rounded-md hover:bg-sidebar-accent transition-colors"
                title="Meu Perfil"
              >
                <User className="w-4 h-4 text-sidebar-muted" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!user ? (
            <div className="p-4">
              <Link
                href="/login"
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors justify-center"
              >
                <LogIn className="w-4 h-4" />
                <span>Entrar / Login</span>
              </Link>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Faça login para ver suas tarefas.
              </p>
            </div>
          ) : (
            <nav className="p-4 space-y-6">
              {/* Dashboard e Calendário */}
              <div className="space-y-2">
                <Link
                  href="/"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors',
                    isDashboardRoot && 'bg-sidebar-accent text-sidebar-primary font-semibold'
                  )}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <Link
                  href="/calendar"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors',
                    pathname === '/calendar' && 'bg-sidebar-accent text-sidebar-primary font-semibold'
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  Calendário
                </Link>
              </div>

              {/* BLOCOS DE TEMPO */}
              <div>
                <div
                  onClick={() => toggleSection('blocos')}
                  className="flex items-center justify-between px-3 py-2 w-full text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:bg-sidebar-accent rounded-md transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 transition-transform',
                        expandedSections.blocos && 'rotate-90'
                      )}
                    />
                    <span>Blocos de Tempo</span>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Link href="/groups?action=create&type=time" className="hover:text-foreground">
                      <Plus className="w-3 h-3" />
                    </Link>
                    <Link href="/groups?type=time" className="hover:text-foreground">
                      <Settings className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {expandedSections.blocos && (
                  <div className="space-y-1 mt-1">
                    {loadingGroups ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Carregando...</div>
                    ) : timeGroups.length === 0 ? (
                      <div className="px-3 text-xs text-muted-foreground italic">
                        Nenhum bloco definido
                      </div>
                    ) : (
                      timeGroups.map((group) => (
                        <div
                          key={group.id}
                          id={`group-${group.id}`}
                          onDragOver={(e) => handleDragOver(e, group.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDropOnGroup(e, group.id)}
                          data-sidebar-type="group"
                          data-sidebar-id={group.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group/link",
                            (isDragOver === group.id && dragOverType === 'group')
                              ? "bg-primary/15 ring-2 ring-primary/50 shadow-sm"
                              : activeGroupId === String(group.id)
                                ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                                : "hover:bg-sidebar-accent"
                          )}
                        >
                          <Link
                            href={`/?group=${group.id}`}
                            className="flex-1 flex items-center gap-2"
                          >
                              <span className="flex items-center gap-2">
                                <span style={{ color: group.color ?? undefined }}>
                                  <GroupIcon icon={getParsedValue(group.icon)} fallback={Clock} className="w-4 h-4" />
                                </span>
                                <span className="truncate">{group.title}</span>
                              </span>
                          </Link>
                          <button
                            onClick={(e) => { e.preventDefault(); toggleGroupVisibility(group); }}
                            className={cn(
                              "p-1 rounded opacity-0 group-hover/link:opacity-100 transition-opacity",
                              group.show_on_dashboard ? "text-sidebar-muted hover:text-primary" : "text-destructive"
                            )}
                            title={group.show_on_dashboard ? "Ocultar do Dashboard" : "Mostrar no Dashboard"}
                          >
                            {group.show_on_dashboard ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              deleteGroup(group);
                            }}
                            className="p-1 hover:bg-destructive/20 hover:text-destructive rounded opacity-0 group-hover/link:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* LISTAS */}
              <div>
                <div
                  onClick={() => toggleSection('listas')}
                  className="flex items-center justify-between px-3 py-2 w-full text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:bg-sidebar-accent rounded-md transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 transition-transform',
                        expandedSections.listas && 'rotate-90'
                      )}
                    />
                    <span>Listas</span>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Link href="/groups?action=create&type=list" className="hover:text-foreground">
                      <Plus className="w-3 h-3" />
                    </Link>
                    <Link href="/groups?type=list" className="hover:text-foreground">
                      <Settings className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {expandedSections.listas && (
                  <div className="space-y-1 mt-1">
                    {loadingGroups ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Carregando...</div>
                    ) : listGroups.length === 0 ? (
                      <div className="px-3 text-xs text-muted-foreground italic">
                        Nenhuma lista definida
                      </div>
                    ) : (
                      listGroups.map((group) => (
                        <div
                          key={group.id}
                          id={`group-${group.id}`}
                          onDragOver={(e) => handleDragOver(e, group.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDropOnGroup(e, group.id)}
                          data-sidebar-type="group"
                          data-sidebar-id={group.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group/link",
                            (isDragOver === group.id && dragOverType === 'group')
                              ? "bg-primary/15 ring-2 ring-primary/50 shadow-sm"
                              : activeGroupId === String(group.id)
                                ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                                : "hover:bg-sidebar-accent"
                          )}
                        >
                          <Link
                            href={`/?group=${group.id}`}
                            className="flex-1 flex items-center gap-2"
                          >
                              <span className="flex items-center gap-2">
                                <span style={{ color: group.color ?? undefined }}>
                                  <GroupIcon icon={getParsedValue(group.icon)} fallback={List} className="w-4 h-4" />
                                </span>
                                <span className="truncate">{group.title}</span>
                              </span>
                          </Link>
                          <button
                            onClick={(e) => { e.preventDefault(); toggleGroupVisibility(group); }}
                            className={cn(
                              "p-1 rounded opacity-0 group-hover/link:opacity-100 transition-opacity",
                              group.show_on_dashboard ? "text-sidebar-muted hover:text-primary" : "text-destructive"
                            )}
                            title={group.show_on_dashboard ? "Ocultar do Dashboard" : "Mostrar no Dashboard"}
                          >
                            {group.show_on_dashboard ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              deleteGroup(group);
                            }}
                            className="p-1 hover:bg-destructive/20 hover:text-destructive rounded opacity-0 group-hover/link:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* PROJETOS (Nova seção) */}
              <div>
                <div
                  onClick={() => {
                    toggleSection('projetos');
                    setShowProjectsView(true);
                  }}
                  className="flex items-center justify-between px-3 py-2 w-full text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:bg-sidebar-accent rounded-md transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 transition-transform',
                        expandedSections.projetos && 'rotate-90'
                      )}
                    />
                    <span>Projetos</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProjectModal(true);
                    }}
                    className="p-1 hover:bg-accent rounded"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {expandedSections.projetos && (
                  <div className="space-y-1 mt-1">
                    {loadingProjects ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Carregando...</div>
                    ) : projects.length === 0 ? (
                      <div className="px-3 text-xs text-muted-foreground italic">
                        Nenhum projeto definido
                      </div>
                    ) : (
                      projects.map((project) => {
                        const isOwner = project.owner_id === user?.id;
                        return (
                        <div
                          key={project.id}
                          id={`project-${project.id}`}
                          onDragOver={(e) => handleDragOver(e, project.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDropOnProject(e, project.id)}
                          data-sidebar-type="project"
                          data-sidebar-id={project.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group/link",
                            (isDragOver === project.id && dragOverType === 'project')
                              ? "bg-primary/15 ring-2 ring-primary/50 shadow-sm"
                              : activeProjectId === String(project.id)
                                ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                                : "hover:bg-accent/50"
                          )}
                        >
                          <Link
                            href={`/?project=${project.id}`}
                            onClick={() => setShowProjectsView(false)}
                            className="flex-1 flex items-center gap-2"
                          >
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="truncate">{project.name}</span>
                            {!isOwner && (
                              <span className="text-xs text-muted-foreground ml-auto">compartilhado</span>
                            )}
                          </Link>
                          <button
                            onClick={(e) => { e.preventDefault(); toggleProjectVisibility(project); }}
                            className={cn(
                              "p-1 rounded opacity-0 group-hover/link:opacity-100 transition-opacity",
                              project.show_on_dashboard ? "text-sidebar-muted hover:text-primary" : "text-destructive"
                            )}
                            title={project.show_on_dashboard ? "Ocultar do Dashboard" : "Mostrar no Dashboard"}
                          >
                            {project.show_on_dashboard ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        </div>
                      )})
                    )}
                  </div>
                )}
              </div>

              {/* PLANEJAMENTO (Metas e Finanças) */}
              <div>
                <button
                  onClick={() => toggleSection('planejamento')}
                  className="flex items-center justify-between px-3 py-2 w-full text-xs font-semibold text-sidebar-muted uppercase tracking-wider hover:bg-sidebar-accent rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 transition-transform',
                        expandedSections.planejamento && 'rotate-90'
                      )}
                    />
                    <span>Planejamento</span>
                  </div>
                </button>

                {expandedSections.planejamento && (
                  <div className="space-y-1 mt-1">
                    <Link
                      href="/goals"
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors',
                        pathname === '/goals' && 'bg-sidebar-accent text-sidebar-primary font-semibold'
                      )}
                    >
                      <Target className="w-4 h-4" />
                      Metas
                    </Link>
                    <Link
                      href="/finances"
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors',
                        pathname === '/finances' && 'bg-sidebar-accent text-sidebar-primary font-semibold'
                      )}
                    >
                      <Wallet className="w-4 h-4" />
                      Finanças
                    </Link>
                  </div>
                )}
              </div>

              {/* Todas Tarefas */}
              <div className="pt-4 border-t">
                <Link
                  href="/todos"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-primary transition-colors',
                    pathname === '/todos' && 'bg-sidebar-accent text-sidebar-primary font-semibold'
                  )}
                >
                  <CheckSquare className="w-4 h-4" />
                  Todas Tarefas
                </Link>
              </div>

              {/* Sair */}
              <div className="pt-4 border-t">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-muted hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
                >
                  <LogOut className="w-5 h-5" />
                  Sair
                </button>
              </div>
            </nav>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {showProjectsView && user ? (
          <ProjectsView
            projects={projects}
            userId={user.id}
            onUpdateProjects={setProjects}
            onClose={() => setShowProjectsView(false)}
          />
        ) : (
          children
        )}
      </main>

      {/* Dialog de Perfil */}
      <ProfileDialog
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        user={user}
      />
    </div>
  );
}

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DefaultLayoutInner>{children}</DefaultLayoutInner>
    </Suspense>
  );
}
