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
} from 'lucide-react';

interface Project {
  id: number;
  owner_id: string;
  name: string;
  title?: string;
  color: string;
  shared_with: string[];
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
    } else {
      setProjects([]);
      setLoadingProjects(false);
    }
  }, [user]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('owner_id', user.id);

    if (error) {
      console.error('Erro ao buscar projetos:', error);
      setProjects([]);
    } else {
      setProjects(data ?? []);
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
    if (!newProjectName.trim() || !user) return;

    const { data, error } = await client
      .from('projects')
      .insert({
        user_id: user.id,
        name: newProjectName,
        color: newProjectColor,
      })
      .select()
      .single();

    if (!error && data) {
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
    <div className="flex h-screen bg-background">
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
                        const isOwner = project.user_id === user?.id;
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
