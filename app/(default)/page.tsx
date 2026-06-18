'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X, GripVertical, Star, ArrowRight, XCircle, Plus, ChevronDown, Edit2, Trash2, Folder, Share, User, Search } from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface Task {
  id: number;
  user_id: string;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  view_group_id: number | null;
  project_id: number | null;
  section_id: number | null;
  created_at: string;
}

interface Group {
  id: number;
  user_id: string;
  title: string;
  type: 'time' | 'list';
  color: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface Project {
  id: number;
  owner_id: string;
  title: string;
  color: string;
}

interface Section {
  id: number;
  user_id: string;
  project_id: number;
  title: string;
  order: number;
}

interface ProjectInvite {
  id: number;
  project_id: number;
  invited_user_id: string;
  invited_by_user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  project?: { id: number; title: string; color: string };
  inviter?: { full_name: string; email: string };
}

interface PendingInvite {
  id: number;
  project_id: number;
  project_title: string;
  project_color: string;
  inviter_name: string;
  inviter_email: string;
}

function DashboardContent() {
  const [user, setUser] = useState<any>(null);
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
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{userId: string; memberId: number}[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = createClient();

  const selectedGroupId = searchParams.get('group');
  const selectedProjectId = searchParams.get('project');
  const selectedGroup = selectedGroupId ? groups.find(g => g.id === parseInt(selectedGroupId)) : null;
  const selectedProject = selectedProjectId ? projects.find(p => p.id === parseInt(selectedProjectId)) : null;

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
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
      window.addEventListener('projects_updated', handleProjectsUpdated);

      return () => {
        client.removeChannel(channel);
        window.removeEventListener('projects_updated', handleProjectsUpdated);
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

    if (data) setGroups(data);
  };

  const fetchProjects = async () => {
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

    const memberProjectIds: number[] = memberProjects?.map(m => m.project_id).filter((id): id is number => typeof id === 'number') || [];
    const { data: sharedProjects } = memberProjectIds.length > 0
      ? await client.from('projects').select('*').in('id', memberProjectIds)
      : { data: [] };

    const allProjects = [...(ownProjects || []), ...(sharedProjects || [])];

    if (error) console.error('Erro fetchProjects:', error);
    if (allProjects) setProjects(allProjects);
  };

  const fetchSections = async () => {
    if (!user || !selectedProjectId) return;

    const { data } = await client
      .from('sections')
      .select('*')
      .eq('project_id', parseInt(selectedProjectId))
      .order('order');

    if (data) {
      setSections(data);
      const initialExpanded: Record<number, boolean> = {};
      data.forEach((s: Section) => { initialExpanded[s.id] = true; });
      setExpandedSections(initialExpanded);
    }
  };

  const openShareModal = async () => {
    setShowShareModal(true);
    setLoadingUsers(true);
    // Buscar todos os usuários (exceto o atual)
    const { data: usersData } = await client
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .neq('id', user.id)
      .limit(50);
    if (usersData) setAllUsers(usersData);

    // Buscar membros atuais do projeto com IDs
    if (selectedProject) {
      const { data: members } = await client
        .from('project_members')
        .select('id, user_id')
        .eq('project_id', selectedProject.id);
      setProjectMembers(members?.map(m => ({ userId: m.user_id, memberId: m.id })) || []);
    } else {
      setProjectMembers([]);
    }
    setLoadingUsers(false);
  };

  const toggleShareUser = async (targetUserId: string) => {
    if (!selectedProject || selectedProject.owner_id !== user.id) return;

    // Verificar se já é membro
    const { data: existingMember } = await client
      .from('project_members')
      .select('id')
      .eq('project_id', selectedProject.id)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (existingMember) {
      // Remover membro
      await client
        .from('project_members')
        .delete()
        .eq('id', existingMember.id);
    } else {
      // Verificar se já existe convite pendente
      const { data: existingInvite } = await client
        .from('project_invites')
        .select('id')
        .eq('project_id', selectedProject.id)
        .eq('invited_user_id', targetUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingInvite) return;

      // Criar convite
      await client
        .from('project_invites')
        .insert({
          project_id: selectedProject.id,
          invited_user_id: targetUserId,
          invited_by_user_id: user.id,
          status: 'pending'
        });
    }
  };

  const removeMember = async (memberId: number, memberUserId: string) => {
    if (!selectedProject || selectedProject.owner_id !== user.id) return;

    await client.from('project_members').delete().eq('id', memberId);
    setProjectMembers(projectMembers.filter(m => m.memberId !== memberId));

    // Se o usuário atual é o membro removido, tirar da lista de projetos
    if (user.id === memberUserId) {
      setProjects(projects.filter(p => p.id !== selectedProject.id));
    }
  };

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await client
      .from('todos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at');

    if (data) setTasks(data);
    setLoading(false);
  };

  const fetchPendingInvites = async () => {
    if (!user) return;

    const { data: invites } = await client
      .from('project_invites')
      .select('id, project_id, invited_by_user_id, status, created_at')
      .eq('invited_user_id', user.id)
      .eq('status', 'pending');

    if (invites && invites.length > 0) {
      // Buscar dados dos projetos e inviters separadamente
      const projectIds = [...new Set(invites.map(i => i.project_id))];
      const inviterIds = [...new Set(invites.map(i => i.invited_by_user_id))];

      const [{ data: projects }, { data: profiles }] = await Promise.all([
        client.from('projects').select('id, title, color').in('id', projectIds),
        client.from('profiles').select('id, full_name, email').in('id', inviterIds),
      ]);

      const projectsMap: any = {};
      projects?.forEach(p => { projectsMap[p.id] = p; });

      const profilesMap: any = {};
      profiles?.forEach(p => { profilesMap[p.id] = p; });

      const formattedInvites: PendingInvite[] = invites.map((inv: any) => ({
        id: inv.id,
        project_id: inv.project_id,
        project_title: projectsMap[inv.project_id]?.title || 'Projeto',
        project_color: projectsMap[inv.project_id]?.color || '#6366f1',
        inviter_name: profilesMap[inv.invited_by_user_id]?.full_name || 'Usuário',
        inviter_email: profilesMap[inv.invited_by_user_id]?.email || '',
      }));

      setPendingInvites(formattedInvites);
      if (formattedInvites.length > 0) {
        setShowInviteModal(true);
      }
    }
    setInvitesLoaded(true);
  };

  const acceptInvite = async (inviteId: number, projectId: number) => {
    if (!user) return;

    // Atualizar status do convite para aceito
    await client
      .from('project_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    // Adicionar como membro do projeto
    await client
      .from('project_members')
      .insert({ project_id: projectId, user_id: user.id });

    // Atualizar lista de projetos
    const { data: project } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (project) {
      setProjects([...projects, project]);
      window.dispatchEvent(new CustomEvent('projects_updated'));
    }

    // Remover do modal
    setPendingInvites(pendingInvites.filter(inv => inv.id !== inviteId));
    if (pendingInvites.length <= 1) {
      setShowInviteModal(false);
    }
  };

  const declineInvite = async (inviteId: number) => {
    if (!user) return;

    await client
      .from('project_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId);

    setPendingInvites(pendingInvites.filter(inv => inv.id !== inviteId));
    if (pendingInvites.length <= 1) {
      setShowInviteModal(false);
    }
  };

  const handleAddTask = async (sectionId?: number) => {
    const title = newTaskTitle.trim();
    if (!title || !user) return;

    const taskData: any = {
      user_id: user.id,
      title: title,
      is_completed: false,
    };

    if (selectedProjectId) {
      taskData.project_id = parseInt(selectedProjectId);
      if (sectionId !== undefined) {
        taskData.section_id = sectionId;
      }
    }

    if (selectedGroupId && !selectedProjectId) {
      taskData.view_group_id = parseInt(selectedGroupId);
    }

    const { data, error } = await client
      .from('todos')
      .insert(taskData)
      .select()
      .single();

    if (!error && data) {
      setTasks(prev => [data, ...prev]);
      setNewTaskTitle('');
    }
  };

  const toggleTask = async (task: Task) => {
    const newCompleted = !task.is_completed;

    await client
      .from('todos')
      .update({ is_completed: newCompleted })
      .eq('id', task.id);

    setTasks(tasks.map(t => t.id === task.id ? { ...t, is_completed: newCompleted } : t));
  };

  const deleteTask = async (taskId: number) => {
    await client.from('todos').delete().eq('id', taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const createSection = async (title: string) => {
    if (!title.trim() || !user || !selectedProjectId) return;
    // Only project owner can create sections
    if (selectedProject && selectedProject.owner_id !== user.id) return;

    const { data, error } = await client
      .from('sections')
      .insert({
        user_id: user.id,
        project_id: parseInt(selectedProjectId),
        title: title.trim(),
        order: sections.length,
      })
      .select()
      .single();

    if (!error && data) {
      setSections(prev => [...prev, data]);
      setExpandedSections(prev => ({ ...prev, [data.id]: true }));
    }
  };

  const updateSection = async (sectionId: number, newTitle: string) => {
    if (!newTitle.trim()) return;

    await client
      .from('sections')
      .update({ title: newTitle.trim() })
      .eq('id', sectionId);

    setSections(sections.map(s => s.id === sectionId ? { ...s, title: newTitle.trim() } : s));
    setEditingSection(null);
    setEditingSectionTitle('');
  };

  const deleteSection = async (sectionId: number) => {
    await client.from('sections').delete().eq('id', sectionId);
    setSections(sections.filter(s => s.id !== sectionId));
    setTasks(tasks.map(t => t.section_id === sectionId ? { ...t, section_id: null } : t));
  };

  const deleteProject = async () => {
    if (!selectedProject || !user || selectedProject.owner_id !== user.id) return;
    if (!confirm(`Tem certeza que deseja excluir o projeto "${selectedProject.title}"? Esta ação não pode ser desfeita.`)) return;

    const projectId = selectedProject.id;

    // Excluir o projeto (cascade remove members e sections automaticamente)
    await client.from('projects').delete().eq('id', projectId);

    // Atualizar UI
    setProjects(projects.filter(p => p.id !== projectId));
    window.dispatchEvent(new CustomEvent('projects_updated'));
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

  const filteredShareUsers = allUsers.filter((u: any) => {
    const searchLower = searchUsers.toLowerCase();
    const name = (u.full_name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower);
  });

  const filteredTasks = tasks.filter(task => {
    if (selectedGroupId && task.view_group_id !== parseInt(selectedGroupId)) return false;
    if (selectedProjectId && task.project_id !== parseInt(selectedProjectId)) return false;
    if (!showCompleted && task.is_completed) return false;
    if (onlyToday && !isToday(task.due_date)) return false;
    return true;
  });

  const groupedTasks = filteredTasks.reduce((acc, task) => {
    const groupId = task.view_group_id ?? 'inbox';
    if (!acc[groupId]) {
      acc[groupId] = [];
    }
    acc[groupId].push(task);
    return acc;
  }, {} as Record<string | number, Task[]>);

  const getGroupInfo = (groupId: string | number): { title: string; color: string | null } => {
    if (groupId === 'inbox') return { title: 'Caixa de Entrada', color: null };
    const group = groups.find(g => g.id === groupId);
    return { title: group?.title ?? 'Sem Categoria', color: group?.color ?? null };
  };

  const renderTaskItem = (task: Task, sectionId?: number) => (
    <div
      key={task.id}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/5 transition-colors group"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-move flex-shrink-0" />
      <button
        onClick={() => toggleTask(task)}
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
          task.is_completed
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/10'
        )}
      >
        {task.is_completed && <Check className="w-3 h-3" />}
      </button>
      <span className={cn('flex-1 text-sm', task.is_completed && 'line-through text-muted-foreground')}>
        {task.title}
      </span>
      <button className="p-1 text-muted-foreground/50 hover:text-yellow-500 transition-colors">
        <Star className="w-4 h-4" />
      </button>
      <button
        onClick={() => deleteTask(task.id)}
        className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      {/* Modal de Convites */}
      {showInviteModal && pendingInvites.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 w-96 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Convites de Projeto</h3>
              <button onClick={() => setShowInviteModal(false)} className="p-1 hover:bg-accent rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="p-4 rounded-lg border bg-accent/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: invite.project_color }}
                    >
                      <Folder className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">{invite.project_title}</p>
                      <p className="text-xs text-muted-foreground">
                        Convidado por {invite.inviter_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptInvite(invite.id, invite.project_id)}
                      className="flex-1 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors text-sm font-medium"
                    >
                      Aceitar
                    </button>
                    <button
                      onClick={() => declineInvite(invite.id)}
                      className="flex-1 py-2 rounded-lg border border-input hover:bg-accent transition-colors text-sm"
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Compartilhamento */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShareModal(false)}>
          <div className="bg-card rounded-xl p-6 w-96 shadow-xl max-h-96 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Compartilhar projeto</h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 hover:bg-accent rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Membros atuais */}
            {projectMembers.length > 0 && (
              <div className="mb-4 pb-4 border-b border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Membros atuais</p>
                <div className="space-y-2">
                  {projectMembers.map((member) => {
                    const memberProfile = allUsers.find(u => u.id === member.userId);
                    return (
                      <div key={member.memberId} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                            {memberProfile?.avatar_url ? (
                              <img src={memberProfile.avatar_url} className="w-7 h-7 rounded-full" />
                            ) : (
                              <User className="w-3 h-3 text-primary" />
                            )}
                          </div>
                          <span className="text-sm">{memberProfile?.full_name || memberProfile?.email || 'Usuário'}</span>
                        </div>
                        <button
                          onClick={() => removeMember(member.memberId, member.userId)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remover membro"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Busca */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchUsers}
                onChange={(e) => setSearchUsers(e.target.value)}
                placeholder="Buscar usuário para adicionar..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {/* Lista de usuários */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {loadingUsers ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
              ) : filteredShareUsers.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Nenhum usuário encontrado</div>
              ) : (
                filteredShareUsers.map((u: any) => {
                  const isShared = projectMembers.some(m => m.userId === u.id);
                  return (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} className="w-8 h-8 rounded-full" />
                          ) : (
                            <User className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{u.full_name || u.email}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleShareUser(u.id)}
                        className={cn(
                          'flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors',
                          isShared
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        )}
                      >
                        {isShared ? (
                          <>
                            <Check className="w-3 h-3" />
                            Membro
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            Convidar
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">
            {selectedProject ? selectedProject.title : selectedGroup ? selectedGroup.title : 'Dashboard'}
          </h1>
          {(selectedGroup || selectedProject) && (
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent hover:bg-accent/70 text-sm transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Limpar filtro
            </button>
          )}
          {selectedProject && user && selectedProject.owner_id === user.id && (
            <>
              <button
                onClick={openShareModal}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-sm transition-colors"
              >
                <Share className="w-4 h-4" />
                Compartilhar
              </button>
              <button
                onClick={deleteProject}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-muted-foreground">Mostrar Concluídas</span>
            <div
              onClick={() => setShowCompleted(!showCompleted)}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative cursor-pointer',
                showCompleted ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div
                className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                  showCompleted ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-muted-foreground">Apenas Atuais</span>
            <div
              onClick={() => setOnlyToday(!onlyToday)}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative cursor-pointer',
                onlyToday ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div
                className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                  onlyToday ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </div>
          </label>
        </div>
      </div>

      {/* Input adicionar tarefa */}
      <div className="relative mb-8">
        <input
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
          className="w-full px-4 py-3 pr-12 rounded-xl border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-shadow"
        />
        <ArrowRight
          className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground cursor-pointer hover:text-primary transition-colors"
          onClick={() => handleAddTask()}
        />
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
                <div key={section.id} className="bg-accent/10 rounded-xl border border-accent/20 overflow-hidden">
                  {/* Header da seção */}
                  <div
                    className="flex items-center justify-between px-4 py-3 border-b border-accent/20 cursor-pointer hover:bg-accent/20 transition-colors"
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
                        <input
                          type="text"
                          value={editingSectionTitle}
                          onChange={(e) => setEditingSectionTitle(e.target.value)}
                          onBlur={() => updateSection(section.id, editingSectionTitle)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateSection(section.id, editingSectionTitle);
                            if (e.key === 'Escape') { setEditingSection(null); setEditingSectionTitle(''); }
                          }}
                          className="px-2 py-1 text-sm font-semibold bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary"
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
                      <button
                        onClick={() => { setEditingSection(section.id); setEditingSectionTitle(section.title); }}
                        className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteSection(section.id)}
                        className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Tarefas da seção */}
                  {expandedSections[section.id] && (
                    <div className="p-2">
                      {getTasksBySection(section.id).map((task) => renderTaskItem(task, section.id))}
                      {/* Input para nova tarefa na seção */}
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          placeholder="Adicionar tarefa..."
                          className="flex-1 px-3 py-2 text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
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
                </div>
              ))}

              {/* Tarefas sem seção */}
              {getTasksBySection(null).length > 0 && (
                <div className="bg-accent/10 rounded-xl border border-accent/20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-accent/20">
                    <div className="flex items-center gap-3">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">Sem seção</span>
                      <span className="text-xs text-muted-foreground">
                        ({getTasksBySection(null).length})
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    {getTasksBySection(null).map((task) => renderTaskItem(task))}
                  </div>
                </div>
              )}

              {/* Botão nova seção */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const title = prompt('Nome da nova seção:');
                    if (title?.trim()) { createSection(title.trim()); }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-primary hover:bg-accent/20 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Nova seção
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* MODO NORMAL: Tarefas agrupadas por grupo */
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <p>{selectedGroup ? 'Nenhuma tarefa neste grupo.' : 'Nenhuma tarefa encontrada.'}</p>
              <p className="text-sm mt-2">Adicione uma tarefa acima para começar.</p>
            </div>
          ) : (
            Object.entries(groupedTasks).map(([groupId, groupTasks]) => {
              const { title, color } = getGroupInfo(groupId);
              return (
                <div
                  key={groupId}
                  className="bg-accent/10 rounded-xl border border-accent/20 overflow-hidden"
                >
                  {!selectedGroup && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-accent/20">
                      <span
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        style={color ? { color } : undefined}
                      >
                        {title}
                      </span>
                      <button
                        onClick={() => router.push(`/?group=${groupId}`)}
                        className="text-xs text-primary hover:underline"
                      >
                        Selecionar
                      </button>
                    </div>
                  )}
                  <div className="p-2">
                    {groupTasks.map((task) => renderTaskItem(task))}
                  </div>
                </div>
              );
            })
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
