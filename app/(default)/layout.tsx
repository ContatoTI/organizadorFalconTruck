'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { cn } from '@/app/lib/utils';
import { useGroups } from '@/app/lib/GroupsContext';
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
  title?: string;
  color: string;
}

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const { groups, loading: loadingGroups } = useGroups();
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
  const client = createClient();

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

  useEffect(() => {
    if (user) {
      fetchProjects();
      fetchNotifications();
      subscribeToInvites();
    } else {
      setProjects([]);
      setLoadingProjects(false);
      setPendingInvites([]);
      setDeclineNotifications([]);
    }

    return () => {
      client.channel('invites-channel').unsubscribe();
    };
  }, [user]);

  const fetchNotifications = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // Buscar projetos do usuário
    const { data: ownProjects } = await client
      .from('projects')
      .select('id, title, color')
      .eq('owner_id', user.id);

    const { data: memberProjects } = await client
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id);

    const userProjectIds: number[] = [
      ...(ownProjects?.map(p => p.id).filter((id): id is number => typeof id === 'number') || []),
      ...(memberProjects?.map(m => m.project_id).filter((id): id is number => typeof id === 'number') || []),
    ];

    // Buscar convites pendentes
    const { data: invites, error: invitesError } = await client
      .from('project_invites')
      .select('id, project_id, invited_by_user_id, created_at')
      .eq('invited_user_id', user.id)
      .eq('status', 'pending');

    if (invitesError) {
      console.error('Error fetching invites:', invitesError.message, invitesError.code, invitesError.details);
    }

    if (invites && invites.length > 0) {
      const projectIds: number[] = [...new Set(invites.map(i => i.project_id).filter((id): id is number => typeof id === 'number'))];
      const inviterIds: string[] = [...new Set(invites.map(i => i.invited_by_user_id).filter((id): id is string => typeof id === 'string'))];

      const [{ data: projects, error: projectsError }, { data: profiles, error: profilesError }] = await Promise.all([
        client.from('projects').select('id, title, color').in('id', projectIds),
        client.from('profiles').select('id, full_name, email').in('id', inviterIds),
      ]);

      if (projectsError) console.error('Error fetching projects:', projectsError);
      if (profilesError) console.error('Error fetching profiles:', profilesError);

      const projectsMap: any = {};
      projects?.forEach(p => { projectsMap[p.id] = p; });

      const profilesMap: any = {};
      profiles?.forEach(p => { profilesMap[p.id] = p; });

      const formatted = invites.map((inv: any) => ({
        id: inv.id,
        project_id: inv.project_id,
        project_title: projectsMap[inv.project_id]?.title || 'Projeto',
        project_color: projectsMap[inv.project_id]?.color || '#6366f1',
        inviter_name: profilesMap[inv.invited_by_user_id]?.full_name || 'Usuário',
        inviter_email: profilesMap[inv.invited_by_user_id]?.email || '',
        created_at: inv.created_at,
      }));

      setPendingInvites(formatted);
    } else {
      setPendingInvites([]);
    }

    // Buscar recusas dos meus projetos
    if (userProjectIds.length === 0) {
      setDeclineNotifications([]);
      return;
    }

    const { data: declined } = await client
      .from('project_invites')
      .select('id, project_id, invited_user_id, created_at')
      .eq('status', 'declined')
      .in('project_id', userProjectIds);

    if (declined && declined.length > 0) {
      const userIds: string[] = [...new Set(declined.map(d => d.invited_user_id).filter((id): id is string => typeof id === 'string'))];
      const projIds: number[] = [...new Set(declined.map(d => d.project_id).filter((id): id is number => typeof id === 'number'))];

      const [{ data: users }, { data: projs }] = await Promise.all([
        client.from('profiles').select('id, full_name, email').in('id', userIds),
        client.from('projects').select('id, title, color').in('id', projIds),
      ]);

      const usersMap: any = {};
      users?.forEach(u => { usersMap[u.id] = u; });
      const projsMap: any = {};
      projs?.forEach(p => { projsMap[p.id] = p; });

      const formatted = declined.map((dec: any) => ({
        id: dec.id,
        project_id: dec.project_id,
        project_title: projsMap[dec.project_id]?.title || 'Projeto',
        project_color: projsMap[dec.project_id]?.color || '#6366f1',
        declined_user_name: usersMap[dec.invited_user_id]?.full_name || 'Usuário',
        invited_user_id: dec.invited_user_id,
        created_at: dec.created_at,
      }));

      setDeclineNotifications(formatted);
    } else {
      setDeclineNotifications([]);
    }
  };

  const subscribeToInvites = () => {
    client
      .channel('invites-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_invites' },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();
  };

  const acceptInviteFromBell = async (inviteId: number, projectId: number) => {
    await client
      .from('project_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    await client
      .from('project_members')
      .insert({ project_id: projectId, user_id: user.id });

    await fetchProjects();
    fetchNotifications();
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

  const fetchProjects = async () => {
    setLoadingProjects(true);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // Buscar projetos próprios
    const { data: ownProjects, error } = await client
      .from('projects')
      .select('*')
      .eq('owner_id', user.id);

    // Buscar projetos dos quais é membro
    const { data: memberProjects } = await client
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id);

    const memberProjectIds = memberProjects?.map((m: any) => m.project_id) || [];
    const { data: sharedProjects } = memberProjectIds.length > 0
      ? await client.from('projects').select('*').in('id', memberProjectIds)
      : { data: [] };

    const allProjects = [...(ownProjects || []), ...(sharedProjects || [])];

    if (error) {
      console.error('Erro ao buscar projetos:', error);
      setProjects([]);
    } else {
      setProjects(allProjects);
    }
    setLoadingProjects(false);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const createProject = async () => {
    if (!newProjectName.trim() || !user) {
      console.error('Validation failed:', { newProjectName: newProjectName.trim(), user });
      return;
    }

    console.log('Creating project with:', {
      owner_id: user.id,
      title: newProjectName,
      color: newProjectColor,
    });

    const { data, error } = await client
      .from('projects')
      .insert({
        owner_id: user.id,
        title: newProjectName,
        color: newProjectColor,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return;
    }

    if (data) {
      setProjects([...projects, data]);
      setNewProjectName('');
      setNewProjectColor('#6366f1');
      setShowProjectModal(false);
    }
  };

  const handleLogout = async () => {
    await client.auth.signOut();
    window.location.href = '/login';
  };

  const timeGroups = groups.filter((g) => g.type === 'time');
  const listGroups = groups.filter((g) => g.type === 'list');

  return (
    <div className="flex h-screen bg-background relative">
      {/* Sino de Notificações - fixo no canto superior direito */}
      {user && (
        <div className="fixed top-4 right-4 z-40">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-full bg-card border hover:bg-accent transition-colors shadow-sm"
          >
            <Bell className="w-5 h-5" />
            {totalNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                {totalNotifications}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-card rounded-lg border shadow-xl max-h-96 overflow-y-auto">
              <div className="p-3 border-b">
                <h3 className="font-semibold">Notificações</h3>
              </div>

              {pendingInvites.length === 0 && declineNotifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma notificação
                </div>
              ) : (
                <div className="divide-y">
                  {/* Convites pendentes */}
                  {pendingInvites.map((invite) => (
                    <div key={`invite-${invite.id}`} className="p-3">
                      <div className="flex items-start gap-3 mb-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: invite.project_color }}
                        >
                          <Folder className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            Convite para {invite.project_title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Por {invite.inviter_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptInviteFromBell(invite.id, invite.project_id)}
                          className="flex-1 py-1.5 rounded-md bg-green-500 text-white hover:bg-green-600 text-xs font-medium"
                        >
                          Aceitar
                        </button>
                        <button
                          onClick={() => declineInviteFromBell(invite.id)}
                          className="flex-1 py-1.5 rounded-md border hover:bg-accent text-xs"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Recusas */}
                  {declineNotifications.map((notif) => (
                    <div key={`declined-${notif.id}`} className="p-3">
                      <div className="flex items-start gap-3 mb-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: notif.project_color }}
                        >
                          <Folder className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {notif.declined_user_name} recusou o convite
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Projeto: {notif.project_title}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => reinviteUser(notif.project_id, notif.invited_user_id)}
                          className="flex-1 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
                        >
                          Convidar novamente
                        </button>
                        <button
                          onClick={() => dismissDeclineNotification(notif.id)}
                          className="px-3 py-1.5 rounded-md border hover:bg-accent text-xs"
                        >
                          Dispensar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
                      <Link
                        key={group.id}
                        href={`/?group=${group.id}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors"
                      >
                        {group.icon && <span style={{ color: group.color ?? undefined }}>{group.icon}</span>}
                        <span className="truncate">{group.title}</span>
                      </Link>
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
                      <Link
                        key={group.id}
                        href={`/?group=${group.id}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors"
                      >
                        {group.icon && <span style={{ color: group.color ?? undefined }}>{group.icon}</span>}
                        <span className="truncate">{group.title}</span>
                      </Link>
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
                        <Link
                          key={project.id}
                          href={`/?project=${project.id}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors"
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="truncate">{project.name || project.title}</span>
                          {!isOwner && (
                            <span className="text-xs text-muted-foreground ml-auto">compartilhado</span>
                          )}
                        </Link>
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
