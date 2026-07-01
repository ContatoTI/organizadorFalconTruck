'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Edit2, X, FolderKanban } from 'lucide-react';
import { cn, PROJECT_COLORS } from '@/app/lib/utils';
import { projectAPI } from '@/app/lib/projectAPI';
import type { Project } from '@/types/index';

interface ProjectsViewProps {
  projects: Project[];
  userId: string;
  onUpdateProjects: (projects: Project[]) => void;
  onClose: () => void;
}

export function ProjectsView({ projects, userId, onUpdateProjects, onClose }: ProjectsViewProps) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const openEdit = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingProject(project);
    setEditName(project.name);
    setEditColor(project.color);
    setEditDescription(project.description ?? '');
  };

  const saveEdit = async () => {
    if (!editingProject || !editName.trim() || saving) return;
    setSaving(true);

    const { success } = await projectAPI.updateProject(editingProject.id, {
      name: editName.trim(),
      color: editColor,
      description: editDescription.trim() || null,
    });

    if (success) {
      onUpdateProjects(
        projects.map(p =>
          p.id === editingProject.id
            ? { ...p, name: editName.trim(), color: editColor, description: editDescription.trim() || null }
            : p
        )
      );
      setEditingProject(null);
      window.dispatchEvent(new CustomEvent('projects_updated'));
    }
    setSaving(false);
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Projetos</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FolderKanban className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Nenhum projeto definido</p>
            <p className="text-sm">Crie um projeto na sidebar para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const isOwner = project.owner_id === userId;
              return (
                <Link
                  key={project.id}
                  href={`/?project=${project.id}`}
                  onClick={onClose}
                  className="group relative bg-card rounded-xl p-5 border border-border shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <h3 className="font-medium text-base truncate">{project.name}</h3>
                    </div>
                    <button
                      onClick={(e) => openEdit(project, e)}
                      className="p-1.5 hover:bg-accent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{project.description}</p>
                  )}
                  {!isOwner && (
                    <span className="text-xs text-muted-foreground mt-2 block">Compartilhado</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {editingProject && (
        <div
          className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setEditingProject(null)}
        >
          <div
            className="bg-card rounded-xl p-6 w-80 shadow-modal border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Editar Projeto</h3>
              <button
                onClick={() => setEditingProject(null)}
                className="p-1 hover:bg-accent rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Nome do projeto</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome do projeto"
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
                      onClick={() => setEditColor(color)}
                      className={cn(
                        'w-8 h-8 rounded-full transition-transform',
                        editColor === color && 'ring-2 ring-offset-2 ring-primary scale-110'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Descrição</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descrição do projeto"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <button
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
