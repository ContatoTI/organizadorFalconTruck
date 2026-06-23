'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGroups } from '@/app/lib/GroupsContext';
import { Plus, X, Edit2, Trash2 } from 'lucide-react';
import { taskAPI } from '@/app/lib/taskAPI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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
    if (!confirm('Excluir este grupo? As tarefas associadas voltarão para a Caixa de Entrada.')) return;
    // Garante que as tarefas voltem para a Caixa de Entrada (sem bloco/lista).
    // O banco já tem ON DELETE SET NULL, mas limpamos explicitamente como defesa em profundidade.
    await taskAPI.clearTasksFromGroup(groupId);
    await client.from('view_groups').delete().eq('id', groupId);
    refreshGroups();
    window.dispatchEvent(new CustomEvent('tasks-updated'));
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
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Novo Grupo
        </Button>
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
            <Card key={group.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl" style={{ color: group.color ?? undefined }}>
                  {group.icon || (group.type === 'time' ? '🕐' : '📋')}
                </span>
                <div className="flex-1">
                  <h3 className="font-medium">{group.title}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {group.type === 'time' ? 'Bloco de Tempo' : 'Lista'}
                    {group.start_time && group.end_time && (
                      <> ({group.start_time.slice(0,5)} - {group.end_time.slice(0,5)})</>
                    )}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => editGroup(group)} className="text-muted-foreground hover:text-primary">
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteGroup(group.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Editar' : 'Novo'} Grupo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Título</Label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
                placeholder="Nome do grupo"
              />
            </div>

            <div>
              <Label>Tipo</Label>
              <Select
                value={formData.type}
                onValueChange={(val) => setFormData({ ...formData, type: val as 'time' | 'list' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="list">Lista</SelectItem>
                  <SelectItem value="time">Bloco de Tempo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ícone (emoji)</Label>
                <Input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="📋"
                />
              </div>
              <div>
                <Label>Cor</Label>
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="h-10 p-1 cursor-pointer"
                />
              </div>
            </div>

            {formData.type === 'time' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Hora Início</Label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora Fim</Label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Recorrência</Label>
                  <Select
                    value={formData.recurrence_type}
                    onValueChange={(val: string | null) => setFormData({ ...formData, recurrence_type: val || 'weekly' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione recorrência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Dias</Label>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (
                      <Button
                        key={day}
                        type="button"
                        variant={formData.recurrence_days.includes(index) ? 'default' : 'outline'}
                        onClick={() => toggleDay(index)}
                        className="w-10 h-10 p-0"
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={saveGroup}>{editingGroup ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
