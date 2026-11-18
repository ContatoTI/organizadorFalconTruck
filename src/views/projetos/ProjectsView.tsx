'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Edit2, X, FolderKanban, Plus } from 'lucide-react';
import { podeEditarProjeto } from '@/src/views/projetos/regrasProjeto';
import { EditarProjetoDialog } from '@/src/views/projetos/EditarProjetoDialog';
import type { Project } from '@/types/index';

interface ProjectsViewProps {
  projects: Project[];
  userId: string;
  onUpdateProjects: (projects: Project[]) => void;
  onClose: () => void;
  onNovoProjeto: () => void;
}

export function ProjectsView({ projects, userId, onUpdateProjects, onClose, onNovoProjeto }: ProjectsViewProps) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const aoSalvar = (salvo: Project) => {
    onUpdateProjects(projects.map(p => (p.id === salvo.id ? salvo : p)));
    setEditingProject(null);
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Projetos</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onNovoProjeto}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo projeto
            </button>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderKanban className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhum projeto definido</p>
            <p className="text-sm mb-4">Um projeto junta tarefas de um mesmo objetivo, separadas em pastas.</p>
            <button
              onClick={onNovoProjeto}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar primeiro projeto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const isOwner = podeEditarProjeto(project, userId);
              return (
                // O lápis fica fora do link: clicar nele nunca abre o projeto por engano.
                <div key={project.id} className="relative">
                  <Link
                    href={`/?project=${project.id}`}
                    onClick={onClose}
                    className="block h-full bg-card rounded-xl p-5 border border-border shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-3 pr-8">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <h3 className="font-medium text-base truncate">{project.name}</h3>
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{project.description}</p>
                    )}
                    {!isOwner && (
                      <span className="text-xs text-muted-foreground mt-2 block">Compartilhado</span>
                    )}
                  </Link>
                  {isOwner && (
                    // Sempre visível (celular/tablet não têm "passar o mouse").
                    <button
                      onClick={() => setEditingProject(project)}
                      aria-label={`Editar projeto ${project.name}`}
                      title="Editar projeto"
                      className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-accent focus-visible:text-foreground transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EditarProjetoDialog
        projeto={editingProject}
        onFechar={() => setEditingProject(null)}
        onSalvo={aoSalvar}
      />
    </>
  );
}
