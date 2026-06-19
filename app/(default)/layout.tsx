'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn } from '@/app/lib/utils';
import { useGroups } from '@/app/lib/GroupsContext';
import { projectAPI } from '@/app/lib/projectAPI';
import { notificationAPI } from '@/app/lib/notificationAPI';
import { taskAPI } from '@/app/lib/taskAPI';
import { NotificationBell, NotificationsPanel } from '@/app/components/NotificationsPanel';
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
  Trash2,
} from 'lucide-react';

interface Notification {
  id: number;
  type: 'invite_received' | 'invite_declined';
  project_id?: number;
  project_title?: string;
  project_color?: string;
  invited_user_name?: string;
  inviter_name?: string;
  created_at: string;
}

interface Project {
  id: number;
  owner_id: string;
  name: string;
  color: string;
}

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const { groups, loading: loadingGroups, deleteGroup: deleteGroupFromState } = useGroups();
  const client = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    projetos: true,
    planejamento: true,
  });
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#6366f1');
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [declineNotifications, setDeclineNotifications] = useState<any[]>([]);

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
    const handleProjectsUpdated = () => {
      fetchProjects();
    };

    window.addEventListener('projects_updated', handleProjectsUpdated);

    return () => {
      window.removeEventListener('projects_updated', handleProjectsUpdated);
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
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    try {
      const { pendingInvites: invites, declineNotifications: declined } =
        await notificationAPI.getUserNotifications(user.id);

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
          if (data && data.user_id === user?.id) {
            fetchProjects();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => {
          const data = payload.new as any || payload.old as any;
          if (data && (data.owner_id === user?.id || projects.some(p => p.id === data.id))) {
            fetchProjects();
          }
        }
      )
      .subscribe();
  };

  const acceptInviteFromBell = async (inviteId: number, projectId: number) => {
    if (!user) return;

    const result = await notificationAPI.acceptInvite(inviteId, projectId, user.id);

    if (result.success) {
      // Insere o projeto recém-aceito diretamente no estado local (igual à criação de projeto).
      // Garante atualização imediata no menu lateral, independente do timing do fetchProjects().
      if (result.project) {
        setProjects((prev) => {
          if (prev.some((p) => p.id === result.project!.id)) return prev;
          return [...prev, result.project!];
        });
      }

      // fetchProjects agora faz MERGE, então o item local não é sobrescrito,
      // mesmo que o servidor ainda não enxergue o novo vínculo (cache de RLS).
      await fetchProjects();
      await fetchNotifications();
      window.dispatchEvent(new CustomEvent('projects_updated'));
    } else {
      console.error('Erro ao aceitar convite pelo sino:', result.error);
    }
  };

  const declineInviteFromBell = async (inviteId: number) => {
    await client
      .from('project_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId);

    fetchNotifications();
  };

  const dismissDeclineNotification = async (inviteId: number) => {
    await client
      .from('project_invites')
      .delete()
      .eq('id', inviteId);

    fetchNotifications();
  };

  const reinviteUser = async (projectId: number, userId: string) => {
    // Deletar convite recusado
    await client
      .from('project_invites')
      .delete()
      .eq('project_id', projectId)
      .eq('invited_user_id', userId);

    // Criar novo convite
    await client
      .from('project_invites')
      .insert({
        project_id: projectId,
        invited_user_id: userId,
        invited_by_user_id: user.id,
        status: 'pending'
      });

    fetchNotifications();
  };

  const totalNotifications = pendingInvites.length + declineNotifications.length;

  // Faz merge dos projetos retornados pelo servidor com o estado local.
  // - Projetos vindos do servidor sobrescrevem entradas locais com mesmo id (atualização).
  // - Projetos que existem apenas localmente (ex: recém-aceito, ainda não visível por RLS) são MANTIDOS.
  // Isso evita que um fetch com cache de RLS obsoleto apague o projeto que acabou de ser aceito.
  const mergeProjects = (serverProjects: Project[]) => {
    setProjects((prev) => {
      const byId = new Map<number, Project>();
      prev.forEach((p) => byId.set(p.id, p));
      serverProjects.forEach((p) => byId.set(p.id, p));
      return Array.from(byId.values());
    });
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    try {
      const allProjects = await projectAPI.getUserProjects(user.id);
      mergeProjects(allProjects);
    } catch (error) {
      console.error('Erro ao buscar projetos:', error);
      // Em caso de erro, NÃO sobrescreve o estado local — preserva o que já existe.
    } finally {
      setLoadingProjects(false);
    }
  };

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

  const createProject = async () => {
    if (!newProjectName.trim() || !user) return;

    const { data, error } = await client
      .from('projects')
      .insert({
        owner_id: user.id,
        name: newProjectName,
        color: newProjectColor,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error?.message || JSON.stringify(error) || 'Erro desconhecido');
      return;
    }

    if (data) {
      setProjects([...projects, data]);
      setNewProjectName('');
      setNewProjectColor('#6366f1');
      setShowProjectModal(false);
      window.dispatchEvent(new CustomEvent('projects_updated'));
    }
  };

  const handleLogout = async () => {
    await client.auth.signOut();
    window.location.href = '/login';
  };

  const [isDragOver, setIsDragOver] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (isDragOver !== id) {
      setIsDragOver(id);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(null);
  };

  const handleDropOnGroup = async (e: React.DragEvent, groupId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(null);
    
    const taskId = parseInt(e.dataTransfer.getData('taskId'));
    if (!taskId || isNaN(taskId)) return;
    
    await taskAPI.moveTaskToGroup(taskId, groupId);
    
    window.dispatchEvent(new CustomEvent('tasks-updated'));
  };

  const handleDropOnProject = async (e: React.DragEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(null);
    
    const taskId = parseInt(e.dataTransfer.getData('taskId'));
    if (!taskId || isNaN(taskId)) return;
    
    await taskAPI.moveTaskToProject(taskId, projectId);
    
    window.dispatchEvent(new CustomEvent('tasks-updated'));
  };

  const timeGroups = groups.filter((g) => g.type === 'time');
  const listGroups = groups.filter((g) => g.type === 'list');

  return (
    <div className="flex h-screen bg-background relative">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-80 shadow-xl">
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
                  {['#6366f1', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7'].map((color) => (
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

      <aside className="w-64 border-r bg-card hidden md:flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold">Organizador</h1>
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
                    'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors',
                    pathname === '/' && 'bg-primary text-primary-foreground'
                  )}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </Link>
                <Link
                  href="/calendar"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors',
                    pathname === '/calendar' && 'bg-primary text-primary-foreground'
                  )}
                >
                  <Calendar className="w-5 h-5" />
                  Calendário
                </Link>
              </div>

              {/* BLOCOS DE TEMPO */}
              <div>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Blocos de Tempo</span>
                  <div className="flex items-center gap-1">
                    <Link href="/groups?action=create&type=time" className="hover:text-foreground">
                      <Plus className="w-3 h-3" />
                    </Link>
                    <Link href="/groups?type=time" className="hover:text-foreground">
                      <Settings className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {loadingGroups ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Carregando...</div>
                ) : (
                  <div className="space-y-1">
                    {timeGroups.map((group) => (
                      <div
                        key={group.id}
                        onDragOver={(e) => handleDragOver(e, group.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnGroup(e, group.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group/link",
                          isDragOver === group.id ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-accent/50"
                        )}
                      >
                        <Link
                          href={`/?group=${group.id}`}
                          className="flex-1 flex items-center gap-2"
                        >
                          {group.icon && <span style={{ color: group.color ?? undefined }}>{group.icon}</span>}
                          <span className="truncate">{group.title}</span>
                        </Link>
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
                    ))}
                    {timeGroups.length === 0 && (
                      <div className="px-3 text-xs text-muted-foreground italic">
                        Nenhum bloco definido
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LISTAS */}
              <div>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Listas</span>
                  <div className="flex items-center gap-1">
                    <Link href="/groups?action=create&type=list" className="hover:text-foreground">
                      <Plus className="w-3 h-3" />
                    </Link>
                    <Link href="/groups?type=list" className="hover:text-foreground">
                      <Settings className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {loadingGroups ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Carregando...</div>
                ) : (
                  <div className="space-y-1">
                    {listGroups.map((group) => (
                      <div
                        key={group.id}
                        onDragOver={(e) => handleDragOver(e, group.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnGroup(e, group.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group/link",
                          isDragOver === group.id ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-accent/50"
                        )}
                      >
                        <Link
                          href={`/?group=${group.id}`}
                          className="flex-1 flex items-center gap-2"
                        >
                          {group.icon && <span style={{ color: group.color ?? undefined }}>{group.icon}</span>}
                          <span className="truncate">{group.title}</span>
                        </Link>
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
                    ))}
                    {listGroups.length === 0 && (
                      <div className="px-3 text-xs text-muted-foreground italic">
                        Nenhuma lista definida
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PROJETOS (Nova seção) */}
              <div>
                <div
                  onClick={() => toggleSection('projetos')}
                  className="flex items-center justify-between px-3 py-2 w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/50 rounded-md transition-colors cursor-pointer"
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
                          onDragOver={(e) => handleDragOver(e, project.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDropOnProject(e, project.id)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                            isDragOver === project.id ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-accent/50"
                          )}
                        >
                          <Link
                            href={`/?project=${project.id}`}
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
                  className="flex items-center justify-between px-3 py-2 w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-accent/50 rounded-md transition-colors"
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
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors',
                        pathname === '/goals' && 'bg-primary/10 text-primary'
                      )}
                    >
                      <Target className="w-4 h-4" />
                      Metas
                    </Link>
                    <Link
                      href="/finances"
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors',
                        pathname === '/finances' && 'bg-primary/10 text-primary'
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
                    'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors',
                    pathname === '/todos' && 'bg-primary text-primary-foreground'
                  )}
                >
                  <CheckSquare className="w-5 h-5" />
                  Todas Tarefas
                </Link>
              </div>

              {/* Sair */}
              <div className="pt-4 border-t">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors w-full"
                >
                  <LogOut className="w-5 h-5" />
                  Sair
                </button>
              </div>
            </nav>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
