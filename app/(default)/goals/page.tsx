'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Trash2, Target, Check } from 'lucide-react';
import type { Goal } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function GoalsPage() {
  const [user, setUser] = useState<any>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_date: '',
  });
  const router = useRouter();
  const client = createClient();

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
      fetchGoals();
    }
  }, [user]);

  const fetchGoals = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await client
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setGoals(data);
    setLoading(false);
  };

  const saveGoal = async () => {
    if (!formData.title.trim() || !user) return;

    const goalData = {
      user_id: user.id,
      title: formData.title,
      description: formData.description || null,
      target_date: formData.target_date || null,
      is_completed: false,
    };

    if (editingGoal) {
      await client.from('goals').update(goalData).eq('id', editingGoal.id);
      setGoals(goals.map(g => g.id === editingGoal.id ? { ...g, ...goalData } as Goal : g));
    } else {
      const { data } = await client.from('goals').insert(goalData).select().single();
      if (data) setGoals([data as Goal, ...goals]);
    }

    resetForm();
  };

  const deleteGoal = async (goalId: number) => {
    await client.from('goals').delete().eq('id', goalId);
    setGoals(goals.filter(g => g.id !== goalId));
  };

  const toggleGoal = async (goal: Goal) => {
    const newCompleted = !goal.is_completed;
    await client.from('goals').update({ is_completed: newCompleted }).eq('id', goal.id);
    setGoals(goals.map(g => g.id === goal.id ? { ...g, is_completed: newCompleted } : g));
  };

  const editGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      title: goal.title,
      description: goal.description || '',
      target_date: goal.target_date || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingGoal(null);
    setFormData({ title: '', description: '', target_date: '' });
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Target className="w-8 h-8" />
          Metas
        </h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Nova Meta
        </Button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            <p>Nenhuma meta encontrada.</p>
            <p className="text-sm mt-2">Defina suas metas para acompanhar seu progresso.</p>
          </div>
        ) : (
          goals.map((goal) => (
            <Card key={goal.id} className="p-4">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => toggleGoal(goal)}
                  className={`mt-1 w-6 h-6 rounded-full border flex items-center justify-center ${
                    goal.is_completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-input hover:border-primary'
                  }`}
                >
                  {goal.is_completed && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1">
                  <h3 className={`font-medium ${goal.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                    {goal.title}
                  </h3>
                  {goal.description && (
                    <p className="text-sm text-muted-foreground mt-1">{goal.description}</p>
                  )}
                  {goal.target_date && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Prazo: {new Date(goal.target_date).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => editGoal(goal)} className="text-muted-foreground hover:text-primary">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteGoal(goal.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGoal ? 'Editar' : 'Nova'} Meta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Título</Label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Minha meta"
                autoFocus
              />
            </div>

            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição da meta"
                rows={3}
              />
            </div>

            <div>
              <Label>Data alvo (opcional)</Label>
              <Input
                type="date"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={saveGoal}>{editingGoal ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
