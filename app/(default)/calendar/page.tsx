'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';

export default function CalendarPage() {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
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
      fetchTasks();
      fetchGroups();
    }
  }, [user]);

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

  const fetchGroups = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data } = await client
      .from('view_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('title');

    if (data) setGroups(data);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const getTasksForDate = (date: Date) => {
    return tasks.filter((task) => {
      if (!task.due_date) return false;
      const taskDate = new Date(task.due_date);
      return taskDate.toDateString() === date.toDateString();
    });
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const openModal = (date: Date) => {
    setSelectedDate(date);
    setNewTaskTitle('');
    setSelectedGroupId(null);
    setShowModal(true);
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !user || !selectedDate) return;

    const { data, error } = await client
      .from('todos')
      .insert({
        user_id: user.id,
        title: newTaskTitle,
        is_completed: false,
        view_group_id: selectedGroupId,
        due_date: selectedDate.toISOString().split('T')[0],
      })
      .select()
      .single();

    if (!error && data) {
      setTasks([...tasks, data]);
      setShowModal(false);
    }
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const days = getDaysInMonth(currentDate);

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Calendário</h1>

      <div className="bg-card border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-accent rounded-lg">
            ←
          </button>
          <h2 className="text-xl font-semibold capitalize">{getMonthName(currentDate)}</h2>
          <button onClick={nextMonth} className="p-2 hover:bg-accent rounded-lg">
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
            <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dayTasks = getTasksForDate(date);
            const hasTasks = dayTasks.length > 0;
            const hasCompleted = dayTasks.some(t => t.is_completed);

            return (
              <button
                key={date.toISOString()}
                onClick={() => openModal(date)}
                className={`aspect-square p-1 rounded-lg border flex flex-col items-center justify-start transition-colors hover:bg-accent ${
                  isToday(date) ? 'border-primary' : 'border-transparent'
                }`}
              >
                <span className={`text-sm ${isToday(date) ? 'font-bold text-primary' : ''}`}>
                  {date.getDate()}
                </span>
                {hasTasks && (
                  <div className="flex gap-0.5 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasCompleted ? 'bg-muted-foreground' : 'bg-primary'}`} />
                    {dayTasks.length > 1 && (
                      <span className="text-xs text-muted-foreground">+{dayTasks.length - 1}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">
            Tarefas em {selectedDate.toLocaleDateString('pt-BR')}
          </h3>
          <div className="space-y-2">
            {getTasksForDate(selectedDate).map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <span className={task.is_completed ? 'line-through text-muted-foreground' : ''}>
                  {task.title}
                </span>
                {task.view_group_id && groups.find(g => g.id === task.view_group_id) && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {groups.find(g => g.id === task.view_group_id)?.title}
                  </span>
                )}
              </div>
            ))}
            {getTasksForDate(selectedDate).length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhuma tarefa neste dia.</p>
            )}
          </div>
        </div>
      )}

      {showModal && selectedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                Adicionar Tarefa - {selectedDate.toLocaleDateString('pt-BR')}
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              placeholder="Título da tarefa"
              className="w-full px-4 py-2 rounded-lg border border-input bg-background"
              autoFocus
            />

            <select
              value={selectedGroupId ?? ''}
              onChange={(e) => setSelectedGroupId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background"
            >
              <option value="">Sem grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={addTask}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Adicionar
              </button>
              <button
                onClick={() => setShowModal(false)}
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
