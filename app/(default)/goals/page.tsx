'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X, Edit2, Trash2, Target } from 'lucide-react';

export default function GoalsPage() {
  const [user, setUser] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);
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
      completed: false,
    };

    if (editingGoal) {
      await client.from('goals').update(goalData).eq('id', editingGoal.id);
      setGoals(goals.map(g => g.id === editingGoal.id ? { ...g, ...goalData } : g));
    } else {
      const { data } = await client.from('goals').insert(goalData).select().single();
      if (data) setGoals([data, ...goals]);
    }

    resetForm();
  };

  const deleteGoal = async (goalId: number) => {
    await client.from('goals').delete().eq('id', goalId);
    setGoals(goals.filter(g => g.id !== goalId));
  };

  const toggleGoal = async (goal: any) => {
    const newCompleted = !goal.completed;
    await client.from('goals').update({ completed: newCompleted }).eq('id', goal.id);
    setGoals(goals.map(g => g.id === goal.id ? { ...g, completed: newCompleted } : g));
  };

  const editGoal = (goal: any) => {
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
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nova Meta
        </button>
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
            <div key={goal.id} className="p-4 rounded-lg border bg-card">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => toggleGoal(goal)}
                  className={`mt-1 w-6 h-6 rounded-full border flex items-center justify-center ${
                    goal.completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-input hover:border-primary'
                  }`}
                >
                  {goal.completed && '✓'}
                </button>
                <div className="flex-1">
                  <h3 className={`font-medium ${goal.completed ? 'line-through text-muted-foreground' : ''}`}>
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
                  <button onClick={() => editGoal(goal)} className="p-2 text-muted-foreground hover:text-primary">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteGoal(goal.id)} className="p-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card p-6 rounded-lg w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold">{editingGoal ? 'Editar' : 'Nova'} Meta</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Título</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                placeholder="Minha meta"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Descrição (opcional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background"
                placeholder="Descrição da meta"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Data alvo (opcional)</label>
              <input
                type="date"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={saveGoal}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {editingGoal ? 'Salvar' : 'Criar'}
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
