/**
 * 📚 GUIA DE MIGRAÇÃO - Como usar as novas APIs
 * 
 * Este guia mostra como migrar código existente para usar as novas abstrações
 * sem quebrar funcionalidade existente.
 */

// ============================================================================
// 1. USANDO TIPOS CENTRALIZADOS
// ============================================================================

// ❌ ANTES (duplicado em múltiplos arquivos)
interface Group {
  id: number;
  user_id: string;
  title: string;
  // ... mais 10 campos
}

// ✅ DEPOIS (centralizado)
import type { Group, Project, Task } from '@/types/index';

// ============================================================================
// 2. USANDO HOOKS REUTILIZÁVEIS
// ============================================================================

// ❌ ANTES (duplicado)
const [tasks, setTasks] = useState<Task[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const fetch = async () => {
    setLoading(true);
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let query = client
      .from('todos')
      .select('*')
      .eq('user_id', user.id);

    if (filters?.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    const { data } = await query;
    if (data) setTasks(data);
    setLoading(false);
  };

  fetch();
}, [user]);

// ✅ DEPOIS (uma linha!)
import { useFetchData } from '@/app/lib/hooks';

const { data: tasks, loading, error } = useFetchData<Task>('todos', {
  user_id: user?.id,
  project_id: selectedProjectId,
});

// ============================================================================
// 3. USANDO APIs ABSTRATAS - PROJETOS
// ============================================================================

// ❌ ANTES (lógica complexa em page.tsx)
const fetchProjects = async () => {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  const { data: ownProjects } = await client
    .from('projects')
    .select('*')
    .eq('owner_id', user.id);

  const { data: memberProjects } = await client
    .from('project_members')
    .select('project_id')
    .eq('user_id', user.id);

  const memberProjectIds = memberProjects?.map(m => m.project_id) || [];
  const { data: sharedProjects } = memberProjectIds.length > 0
    ? await client.from('projects').select('*').in('id', memberProjectIds)
    : { data: [] };

  const allProjects = [...(ownProjects || []), ...(sharedProjects || [])];
  setProjects(allProjects);
};

// ✅ DEPOIS (uma linha!)
import { projectAPI } from '@/app/lib/projectAPI';

const projects = await projectAPI.getUserProjects(user.id);
setProjects(projects);

// ============================================================================
// 4. USANDO APIs ABSTRATAS - TAREFAS
// ============================================================================

// ❌ ANTES (criar tarefa manualmente)
const saveTask = async () => {
  const { data, error } = await client
    .from('todos')
    .insert({
      user_id: user.id,
      title: newTaskTitle.trim(),
      project_id: selectedProjectId || null,
      section_id: selectedSectionId || null,
      is_completed: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Erro:', error);
    return;
  }

  if (data) {
    setTasks([data, ...tasks]);
    setNewTaskTitle('');
  }
};

// ✅ DEPOIS (simples e consistente)
import { taskAPI } from '@/app/lib/taskAPI';

const saveTask = async () => {
  const result = await taskAPI.createTask(
    user.id,
    newTaskTitle,
    selectedProjectId,
    selectedSectionId
  );

  if (result.success && result.data) {
    setTasks([result.data, ...tasks]);
    setNewTaskTitle('');
  } else {
    setError(result.error || 'Erro ao criar tarefa');
  }
};

// ============================================================================
// 5. TOGGLE DE STATUS (ANTES E DEPOIS)
// ============================================================================

// ❌ ANTES (duplicado em 4+ arquivos)
const toggleTask = async (task: Task) => {
  const newCompleted = !task.is_completed;

  await client
    .from('todos')
    .update({ is_completed: newCompleted })
    .eq('id', task.id);

  setTasks(tasks.map(t =>
    t.id === task.id ? { ...t, is_completed: newCompleted } : t
  ));
};

// ✅ DEPOIS (hook reutilizável)
import { useToggleCompletion } from '@/app/lib/hooks';

const { toggle, loading, error } = useToggleCompletion();

const toggleTask = async (task: Task) => {
  const result = await toggle('todos', task.id, task.is_completed);
  
  if (result.success) {
    setTasks(tasks.map(t =>
      t.id === task.id ? { ...t, is_completed: result.newState } : t
    ));
  }
};

// ============================================================================
// 6. VALIDAÇÃO DE PERMISSÃO (ANTES E DEPOIS)
// ============================================================================

// ❌ ANTES (inseguro - valida DEPOIS de executar)
const openShareModal = async () => {
  // Busca usuários ANTES de validar permissão
  const { data: usersData } = await client
    .from('profiles')
    .select('*')
    .limit(50);

  setAllUsers(usersData);

  // SÓ DEPOIS verifica
  if (selectedProject?.owner_id !== user.id) {
    setError('Acesso negado');
    return;
  }
};

// ✅ DEPOIS (seguro - valida ANTES)
const openShareModal = async () => {
  // Valida PRIMEIRO
  const isOwner = await projectAPI.isProjectOwner(
    selectedProject.id,
    user.id
  );

  if (!isOwner) {
    setError('Apenas o dono pode compartilhar');
    return;
  }

  // SÓ DEPOIS busca dados
  const { data: usersData } = await client
    .from('profiles')
    .select('*')
    .limit(50);

  setAllUsers(usersData);
};

// ============================================================================
// 7. FORM CRUD REUTILIZÁVEL
// ============================================================================

// ❌ ANTES (muito código duplicado)
const [showForm, setShowForm] = useState(false);
const [editing, setEditing] = useState<Goal | null>(null);
const [formData, setFormData] = useState({...});

const open = (goal?: Goal) => {
  if (goal) {
    setEditing(goal);
    setFormData(goal);
  } else {
    setEditing(null);
    setFormData({...});
  }
  setShowForm(true);
};

const close = () => {
  setShowForm(false);
  setEditing(null);
  setFormData({...});
};

// ✅ DEPOIS (hook reutilizável)
import { useCRUDForm } from '@/app/lib/hooks';

const goalForm = useCRUDForm<Goal>({
  id: 0,
  user_id: '',
  title: '',
  description: null,
  target_date: null,
  is_completed: false,
  created_at: new Date().toISOString(),
});

// Usar:
// goalForm.open(existingGoal)
// goalForm.close()
// goalForm.isOpen
// goalForm.editing
// goalForm.data
// goalForm.setField('title', value)

// ============================================================================
// 8. EXEMPLO COMPLETO - PÁGINA REFATORADA
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { useFetchData } from '@/app/lib/hooks';
import { projectAPI } from '@/app/lib/projectAPI';
import { taskAPI } from '@/app/lib/taskAPI';
import type { Project, Task, User } from '@/types/index';

export default function Page() {
  const [user, setUser] = useState<User | null>(null);

  // ✅ Usar hooks ao invés de useState + useEffect
  const { data: projects, loading: loadingProjects } = useFetchData<Project>(
    'projects',
    { owner_id: user?.id }
  );

  const { data: tasks, loading: loadingTasks, refetch: refetchTasks } =
    useFetchData<Task>('todos', {
      user_id: user?.id,
    });

  // Lógica simplificada
  const createTask = async (title: string) => {
    const result = await taskAPI.createTask(user!.id, title);
    if (result.success) {
      refetchTasks();
    }
  };

  const toggleTask = async (task: Task) => {
    const result = await taskAPI.toggleTaskCompletion(
      task.id,
      task.is_completed
    );
    if (result.success) {
      refetchTasks();
    }
  };

  return (
    <div>
      {loadingTasks ? <p>Carregando...</p> : <p>{tasks.length} tarefas</p>}
      {/* ... */}
    </div>
  );
}

// ============================================================================
// ROTEIRO DE MIGRAÇÃO
// ============================================================================

/*
PASSO 1: Depois que todos os tipos estiverem em types/index.ts
  - Remover interfaces locais
  - Importar de types/index

PASSO 2: Refatorar page.tsx
  - Substituir fetchProjects() por projectAPI.getUserProjects()
  - Substituir fetchTasks() por useFetchData()
  - Substituir toggleTask() por taskAPI.toggleTaskCompletion()

PASSO 3: Refatorar layout.tsx
  - Mesmos passos que page.tsx

PASSO 4: Decompor componentes grandes
  - Extrair TaskForm, TaskList, ShareModal em componentes separados
  - Reduzir complexidade de cada arquivo

PASSO 5: Otimizar queries
  - Usar JOINs do Supabase ao invés de múltiplas queries
  - Usar .in() corretamente
*/
