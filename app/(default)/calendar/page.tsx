'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { taskAPI } from '@/app/lib/taskAPI';
import { cn } from '@/app/lib/utils';
import type { Task, Group, User } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

export default function CalendarPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
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
      const { data: { user: authUser } } = await client.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }
      setUser(authUser as any);
    };
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchTasks(true);
      fetchGroups();

      // Realtime: reflete exclusões/edições de tarefas em tempo real
      const channel = client
        .channel('calendar-todos-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` },
          () => fetchTasks(false)
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchTasks = async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    const data = await taskAPI.getUserTasks(user.id, { showCompleted: true });
    setTasks(data);
    if (showLoading) setLoading(false);
  };

  const fetchGroups = async () => {
    const { data } = await client
      .from('view_groups')
      .select('*')
      .eq('user_id', user?.id)
      .order('title');

    if (data) setGroups(data as Group[]);
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
    const raw = newTaskTitle.trim();
    if (!raw || !user || !selectedDate) return;

    const titles = raw.split('\n').map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) return;

    // OPTIMISTIC UPDATE
    const dateStr = selectedDate.toISOString().split('T')[0];
    const newOptimisticTasks = titles.map((title, index) => ({
      id: Date.now() + index,
      title,
      user_id: user.id,
      project_id: null,
      section_id: null,
      view_group_id: selectedGroupId || null,
      is_completed: false,
      position: 99999,
      created_at: new Date().toISOString(),
      due_date: dateStr,
      description: null,
      priority: null,
      status: 'a_fazer',
      creator_name: (user as any).user_metadata?.full_name || user.email,
    } as Task));

    setTasks(prev => [...prev, ...newOptimisticTasks]);
    setShowModal(false);

    const results = await Promise.all(titles.map(title => 
      taskAPI.createTask(
        user.id,
        title,
        undefined,
        undefined,
        selectedGroupId || undefined,
        dateStr
      )
    ));

    // Se houve erro, re-faz fetch
    if (results.some(r => !r.success)) {
      await fetchTasks();
    } else {
      // Atualiza IDs temporários pelos reais
      setTasks(prev => {
        const next = [...prev];
        results.forEach((res, i) => {
          if (res.success && res.data) {
            const idx = next.findIndex(t => t.id === newOptimisticTasks[i].id);
            if (idx !== -1) next[idx] = res.data;
          }
        });
        return next;
      });
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
      <div className="flex items-center gap-3 mb-8">
        <CalendarIcon className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">Calendário</h1>
      </div>

      <Card className="p-6 shadow-card border-border">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-semibold capitalize">{getMonthName(currentDate)}</h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dayTasks = getTasksForDate(date);
            const hasTasks = dayTasks.length > 0;
            const hasCompleted = dayTasks.every(t => t.is_completed) && hasTasks;

            return (
              <Button
                key={date.toISOString()}
                variant="ghost"
                onClick={() => openModal(date)}
                className={cn(
                  "aspect-square p-2 rounded-xl border flex flex-col items-center justify-start transition-all hover:bg-accent h-auto w-full",
                  isToday(date) ? "border-primary bg-primary/5" : "border-transparent",
                  selectedDate?.toDateString() === date.toDateString() && "bg-accent border-accent"
                )}
              >
                <span className={cn(
                  "text-sm",
                  isToday(date) ? "font-bold text-primary" : "text-foreground"
                )}>
                  {date.getDate()}
                </span>
                {hasTasks && (
                  <div className="flex gap-0.5 mt-auto">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      hasCompleted ? "bg-muted-foreground" : "bg-primary"
                    )} />
                    {dayTasks.length > 1 && (
                      <span className="text-[10px] text-muted-foreground font-medium">+{dayTasks.length - 1}</span>
                    )}
                  </div>
                )}
              </Button>
            );
          })}
        </div>
      </Card>

      {selectedDate && (
        <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Tarefas em {selectedDate.toLocaleDateString('pt-BR')}
            </h3>
            <Button size="sm" onClick={() => setShowModal(true)} className="rounded-full">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {getTasksForDate(selectedDate).map((task) => (
              <Card key={task.id} className="flex items-center gap-3 p-3 shadow-xs border-border">
                <Checkbox checked={task.is_completed} disabled />
                <span className={cn("text-sm flex-1", task.is_completed && "line-through text-muted-foreground")}>
                  {task.title}
                </span>
                {task.view_group_id && groups.find(g => g.id === task.view_group_id) && (
                  <span className="text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-full uppercase text-muted-foreground">
                    {groups.find(g => g.id === task.view_group_id)?.title}
                  </span>
                )}
              </Card>
            ))}
            {getTasksForDate(selectedDate).length === 0 && (
              <div className="text-center py-8 bg-muted/20 rounded-xl border border-dashed border-border">
                <p className="text-muted-foreground text-sm">Nenhuma tarefa neste dia.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(open) => !open && setShowModal(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Adicionar Tarefa - {selectedDate?.toLocaleDateString('pt-BR')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Título da tarefa</Label>
              <Input
                id="task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                onPaste={async (e) => {
                  const text = e.clipboardData.getData('text');
                  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                  if (lines.length > 1) {
                    e.preventDefault();
                    const newTasks: Task[] = [];
                    for (const title of lines) {
                      const result = await taskAPI.createTask(
                        user.id,
                        title,
                        undefined,
                        undefined,
                        selectedGroupId || undefined,
                        selectedDate!.toISOString().split('T')[0]
                      );
                      if (result.success && result.data) newTasks.push(result.data);
                    }
                    setTasks(prev => [...prev, ...newTasks]);
                    setShowModal(false);
                  }
                }}
                placeholder="Ex: Reunião de planejamento"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-group">Grupo (opcional)</Label>
              <Select
                value={selectedGroupId?.toString() || "none"}
                onValueChange={(val: string | null) => setSelectedGroupId(val === "none" || !val ? null : parseInt(val))}
              >
                <SelectTrigger id="task-group">
                  <SelectValue placeholder="Sem grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>{g.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="sm:justify-start gap-2">
            <Button onClick={addTask} className="flex-1">
              Adicionar
            </Button>
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
