'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { Share2, Users, Folder, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { shareAPI } from '@/app/lib/shareAPI';
import { projectAPI } from '@/app/lib/projectAPI';
import { Card } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function SharesPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mySharedProjects, setMySharedProjects] = useState<any[]>([]);
  const [mySharedSections, setMySharedSections] = useState<any[]>([]);
  const [projectsImMemberOf, setProjectsImMemberOf] = useState<any[]>([]);
  const [sectionsSharedWithMe, setSectionsSharedWithMe] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const client = createClient();
      const { data: { user: u } } = await client.auth.getUser();
      if (!u) return;
      setUser(u);

      const [sharedProjects, sharedSections, memberProjects, sharedSectionsWithMe] = await Promise.all([
        projectAPI.getMySharedProjects(u.id),
        shareAPI.getMySharedSections(u.id),
        projectAPI.getProjectsImMemberOf(u.id),
        shareAPI.getSectionsSharedWithMe(u.id),
      ]);

      setMySharedProjects(sharedProjects);
      setMySharedSections(sharedSections);
      setProjectsImMemberOf(memberProjects);
      setSectionsSharedWithMe(sharedSectionsWithMe);
      setLoading(false);
    };
    load();
  }, []);

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }

  const hasAnyShares = mySharedProjects.length > 0 || mySharedSections.length > 0
    || projectsImMemberOf.length > 0 || sectionsSharedWithMe.length > 0;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Share2 className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Compartilhamentos</h1>
      </div>

      {!hasAnyShares && (
        <div className="text-center py-16 text-muted-foreground">
          <Share2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Nenhum compartilhamento encontrado</p>
          <p className="text-sm mt-1">Compartilhe um projeto ou pasta para vê-lo aqui.</p>
        </div>
      )}

      {/* Projetos que compartilhei */}
      {mySharedProjects.length > 0 && (
        <section>
          <button onClick={() => toggle('myProjects')} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-3">
            {expanded.myProjects ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Users className="w-4 h-4" />
            Projetos que compartilhei ({mySharedProjects.length})
          </button>
          {expanded.myProjects && (
            <div className="space-y-3">
              {mySharedProjects.map(({ project, members }) => (
                <Card key={project.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="font-semibold text-sm">{project.name}</span>
                    </div>
                    <button
                      onClick={() => router.push(`/?project=${project.id}`)}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                      title="Abrir projeto"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {members.map((profile: any) => (
                      <div key={profile.id} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground flex-shrink-0">
                          {(profile.full_name || profile.email || '?')[0].toUpperCase()}
                        </div>
                        <span>{profile.full_name || profile.email}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Pastas que compartilhei */}
      {mySharedSections.length > 0 && (
        <section>
          <button onClick={() => toggle('mySections')} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-3">
            {expanded.mySections ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Folder className="w-4 h-4" />
            Pastas que compartilhei ({mySharedSections.length})
          </button>
          {expanded.mySections && (
            <div className="space-y-3">
              {mySharedSections.map(({ section, project, users }) => (
                <Card key={section.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: section.color || project?.color || '#888' }} />
                      <span className="font-semibold text-sm truncate">{section.title}</span>
                      {project && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">em {project.name}</span>}
                    </div>
                    <button
                      onClick={() => router.push(`/?project=${section.project_id}`)}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 flex-shrink-0"
                      title="Abrir projeto"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {users.map((profile: any) => (
                      <div key={profile.id} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground flex-shrink-0">
                          {(profile.full_name || profile.email || '?')[0].toUpperCase()}
                        </div>
                        <span>{profile.full_name || profile.email}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Projetos compartilhados comigo */}
      {projectsImMemberOf.length > 0 && (
        <section>
          <button onClick={() => toggle('memberProjects')} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-3">
            {expanded.memberProjects ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Users className="w-4 h-4" />
            Projetos compartilhados comigo ({projectsImMemberOf.length})
          </button>
          {expanded.memberProjects && (
            <div className="space-y-3">
              {projectsImMemberOf.map(({ project, owner, memberCount }) => (
                <Card key={project.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="font-semibold text-sm truncate">{project.name}</span>
                    </div>
                    <button
                      onClick={() => router.push(`/?project=${project.id}`)}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 flex-shrink-0"
                      title="Abrir projeto"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    {owner && (
                      <div className="flex items-center gap-1.5">
                        <span>Compartilhado por</span>
                        <span className="font-medium">{owner.full_name || owner.email}</span>
                      </div>
                    )}
                    <span>{memberCount} {memberCount === 1 ? 'membro' : 'membros'}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Pastas compartilhadas comigo */}
      {sectionsSharedWithMe.length > 0 && (
        <section>
          <button onClick={() => toggle('sharedSections')} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-3">
            {expanded.sharedSections ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Folder className="w-4 h-4" />
            Pastas compartilhadas comigo ({sectionsSharedWithMe.length})
          </button>
          {expanded.sharedSections && (
            <div className="space-y-3">
              {sectionsSharedWithMe.map(({ section, project, owner }) => (
                <Card key={section.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: section.color || project?.color || '#888' }} />
                      <span className="font-semibold text-sm truncate">{section.title}</span>
                      {project && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">em {project.name}</span>}
                    </div>
                    <button
                      onClick={() => router.push(`/?project=${section.project_id}`)}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 flex-shrink-0"
                      title="Abrir projeto"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {owner && (
                      <span>Compartilhado por {owner.full_name || owner.email}</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
