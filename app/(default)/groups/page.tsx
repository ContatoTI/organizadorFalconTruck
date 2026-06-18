'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGroups } from '@/app/lib/GroupsContext';
import { Plus, X, Edit2, Trash2 } from 'lucide-react';

function GroupsContent() {
  const { groups, loading, refreshGroups, addGroup } = useGroups();
  const [user, setUser] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'list' as 'time' | 'list',
    icon: '',
    color: '#6366f1',
    start_time: '',
    end_time: '',
    recurrence_type: 'weekly',
    recurrence_days: [] as number[],
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = createClient();
  
  // Refs para evitar closure
  const userRef = useRef(user);
  const formDataRef = useRef(formData);
  
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Handle query params for opening form
  useEffect(() => {
    const action = searchParams.get('action');
    const type = searchParams.get('type');
    
    if (action === 'create') {
      setFormData(prev => ({
        ...prev,
        type: type === 'time' ? 'time' : 'list',
      }));
      setShowForm(true);
    }
  }, [searchParams]);

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

  const saveGroup = useCallback(async () => {
    const currentForm = formDataRef.current;
    const currentUser = userRef.current;
    
    if (!currentForm.title.trim() || !currentUser) return;

    const groupData = {
      user_id: currentUser.id,
      title: currentForm.title,
      type: currentForm.type,
      icon: currentForm.icon || null,
      color: currentForm.color || null,
      start_time: currentForm.type === 'time' ? currentForm.start_time : null,
      end_time: currentForm.type === 'time' ? currentForm.end_time : null,
      recurrence_type: currentForm.type === 'time' ? currentForm.recurrence_type : null,
      recurrence_days: currentForm.type === 'time' ? currentForm.recurrence_days : null,
    };

    const { data, error } = await client
      .from('view_groups')
      .insert(groupData)
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      return;
    }

    if (data) {
      addGroup(data);
    }

    setShowForm(false);
    setEditingGroup(null);
    setFormData({
      title: '',
      type: 'list',
      icon: '',
      color: '#6366f1',
      start_time: '',
      end_time: '',
      recurrence_type: 'weekly',
      recurrence_days: [],
    });
    
    // Go back to groups list
    router.push('/groups');
  }, [client, router, addGroup]);

  const deleteGroup = async (groupId: number) => {
    await client.from('view_groups').delete().eq('id', groupId);
    refreshGroups();
  };

  const editGroup = (group: any) => {
    setEditingGroup(group);
    setFormData({
      title: group.title,
      type: group.type,
      icon: group.icon || '',
      color: group.color || '#6366f1',
      start_time: group.start_time || '',
      end_time: group.end_time || '',
      recurrence_type: group.recurrence_type || 'weekly',
      recurrence_days: group.recurrence_days || [],
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingGroup(null);
    setFormData({
      title: '',
      type: 'list',
      icon: '',
      color: '#6366f1',
      start_time: '',
      end_time: '',
      recurrence_type: 'weekly',
      recurrence_days: [],
    });
  };

  const toggleDay = (day: number) => {
    setFormData({
      ...formData,
      recurrence_days: formData.recurrence_days.includes(day)
        ? formData.recurrence_days.filter(d => d !== day)
        : [...formData.recurrence_days, day],
    });
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Grupos</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Novo Grupo
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <div className="col-span-2 text-center py-8 text-muted-foreground">Carregando...</div>
        ) : groups.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            <p>Nenhum grupo encontrado.</p>
            <p className="text-sm mt-2">Crie um grupo para organizar suas tarefas.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                {group.icon && <span className="text-2xl" style={{ color: group.color ?? undefined }}>{group.icon}</span>}
                <div className="flex-1">
                  <h3 className="font-medium">{group.title}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {group.type === 'time' ? 'Bloco de Tempo' : 'Lista'}
                    {group.start_time && group.end_time && (
                      <> ({group.start_time.slice(0,5)} - {group.end_time.slice(0,5)})</>
                    )}
                  </p>
                </div>
                <button onClick={() => editGroup(group)} className="p-2 text-muted-foreground hover:text-primary">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteGroup(group.id)} className="p-2 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card p-6 rounded-lg w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold">{editingGroup ? 'Editar' : 'Novo'} Grupo</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Título</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                placeholder="Nome do grupo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'time' | 'list' })}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background"
              >
                <option value="list">Lista</option>
                <option value="time">Bloco de Tempo</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Ícone (emoji)</label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                  placeholder="📋"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cor</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 rounded-lg border border-input bg-background cursor-pointer"
                />
              </div>
            </div>

            {formData.type === 'time' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Hora Início</label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Hora Fim</label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Recorrência</label>
                  <select
                    value={formData.recurrence_type}
                    onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                  >
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Dias</label>
                  <div className="flex gap-2 flex-wrap">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(index)}
                        className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                          formData.recurrence_days.includes(index)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-input hover:bg-accent'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-4">
              <button
                onClick={saveGroup}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {editingGroup ? 'Salvar' : 'Criar'}
              </button>
              <button
                onClick={resetForm}
                className="flex-1 px-4 py-2 rounded-lg border border-input hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Carregando...</div>}>
      <GroupsContent />
    </Suspense>
  );
}
