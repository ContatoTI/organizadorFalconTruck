'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/Client';
import {
  indexLogs, habitAppliesOn, currentStreak, completionRate,
} from '@/src/models/habitos/regras';
import { habitAPI } from './clienteHabitos';
import { goalAPI } from '@/src/views/metas/clienteMetas';
import { toISODate, startOfDay } from '@/src/lib/planning';
import { useToast } from '@/src/components/Toast';
import { cn, PROJECT_COLORS, GROUP_EMOJIS } from '@/src/lib/utils';
import { PageShell, PageHeader, EmptyState, PageSkeleton } from '@/src/components/ui/Page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Habit, HabitLog, Goal } from '@/types/index';
import { Repeat, Plus, Flame, Trash2, Pencil, Check } from 'lucide-react';

type AppUser = { id: string; email?: string };

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;
const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** Quantos dias a grade mostra. 12 semanas cabem sem virar planilha. */
const GRID_DAYS = 84;

/**
 * Hábitos.
 *
 * A tela toda gira em volta de um gesto: clicar no quadradinho de hoje.
 * Todo o resto — sequência, porcentagem, histórico — existe só para dar
 * vontade de não quebrar a corrente.
 */
export function PainelHabitos() {
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [user, setUser] = useState<AppUser | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => new Date());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [form, setForm] = useState({
    title: '',
    color: PROJECT_COLORS[11],
    icon: '',
    weekdays: [] as number[],
    goalId: null as number | null,
  });

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user: authUser } } = await client.auth.getUser();
      if (!authUser) { router.push('/login'); return; }
      if (!alive) return;
      setUser(authUser as AppUser);

      const [habitList, logList, goalList] = await Promise.all([
        habitAPI.list(),
        habitAPI.recentLogs(GRID_DAYS + 40),
        goalAPI.list(),
      ]);
      if (!alive) return;
      setHabits(habitList);
      setLogs(logList);
      setGoals(goalList);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [client, router]);

  const logsByHabit = useMemo(() => indexLogs(logs), [logs]);

  /**
   * Os dias da grade, do mais antigo para hoje.
   *
   * A grade tem 7 linhas e flui por coluna, então cada coluna precisa ser uma
   * semana de verdade: começamos no domingo anterior ao primeiro dia. Sem esse
   * alinhamento as linhas não corresponderiam a dias da semana e o desenho
   * mentiria sobre o padrão.
   */
  const gridDays = useMemo(() => {
    const cursor = startOfDay(now);
    cursor.setDate(cursor.getDate() - (GRID_DAYS - 1));
    cursor.setDate(cursor.getDate() - cursor.getDay()); // recua até o domingo

    const days: Date[] = [];
    const last = startOfDay(now);
    while (cursor <= last) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [now]);

  const today = toISODate(startOfDay(now));

  // ── Marcar / desmarcar ───────────────────────────────────────────────────
  const toggleDay = useCallback(async (habit: Habit, day: string) => {
    if (!user) return;
    const marked = logsByHabit.get(habit.id)?.has(day) ?? false;

    // Otimista: o quadradinho tem que responder no clique, sem esperar rede.
    if (marked) {
      setLogs(prev => prev.filter(l => !(l.habit_id === habit.id && l.day === day)));
    } else {
      setLogs(prev => [
        ...prev,
        { id: -Date.now(), habit_id: habit.id, user_id: user.id, day, created_at: new Date().toISOString() },
      ]);
    }

    const res = marked
      ? await habitAPI.unmark(habit.id, day)
      : await habitAPI.mark(habit.id, day);

    if (!res.success) {
      // Desfaz o otimismo e conta o que houve.
      if (marked) {
        setLogs(prev => [
          ...prev,
          { id: -Date.now(), habit_id: habit.id, user_id: user.id, day, created_at: new Date().toISOString() },
        ]);
      } else {
        setLogs(prev => prev.filter(l => !(l.habit_id === habit.id && l.day === day)));
      }
      toast(res.error ?? 'Erro ao marcar hábito', 'error');
    }
  }, [user, logsByHabit, toast]);

  // ── Formulário ───────────────────────────────────────────────────────────
  const openNew = useCallback(() => {
    setEditing(null);
    setForm({
      title: '',
      color: PROJECT_COLORS[(habits.length * 3) % PROJECT_COLORS.length],
      icon: '',
      weekdays: [],
      goalId: null,
    });
    setFormOpen(true);
  }, [habits.length]);

  const openEdit = useCallback((habit: Habit) => {
    setEditing(habit);
    setForm({
      title: habit.title,
      color: habit.color || PROJECT_COLORS[11],
      icon: habit.icon || '',
      weekdays: habit.weekdays ?? [],
      goalId: habit.goal_id,
    });
    setFormOpen(true);
  }, []);

  const saveHabit = useCallback(async () => {
    if (!user || !form.title.trim()) return;

    if (editing) {
      const updates: Partial<Habit> = {
        title: form.title.trim(),
        color: form.color,
        icon: form.icon || null,
        weekdays: form.weekdays.length > 0 ? form.weekdays : null,
        goal_id: form.goalId,
      };
      setHabits(prev => prev.map(h => (h.id === editing.id ? { ...h, ...updates } : h)));
      setFormOpen(false);
      const res = await habitAPI.update(editing.id, updates);
      if (!res.success) toast(res.error ?? 'Erro ao salvar hábito', 'error');
      return;
    }

    const res = await habitAPI.create({
      title: form.title.trim(),
      color: form.color,
      icon: form.icon || null,
      weekdays: form.weekdays,
      goalId: form.goalId,
    });
    if (res.success && res.data) {
      setHabits(prev => [...prev, res.data as Habit]);
      setFormOpen(false);
    } else {
      toast(res.error ?? 'Erro ao criar hábito', 'error');
    }
  }, [user, form, editing, toast]);

  const removeHabit = useCallback(async (habit: Habit) => {
    if (!confirm(`Excluir o hábito “${habit.title}”? Todo o histórico dele vai junto.`)) return;
    setHabits(prev => prev.filter(h => h.id !== habit.id));
    setLogs(prev => prev.filter(l => l.habit_id !== habit.id));
    const res = await habitAPI.remove(habit.id);
    if (!res.success) toast(res.error ?? 'Erro ao excluir hábito', 'error');
  }, [toast]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <PageShell size="lg"><PageSkeleton rows={4} /></PageShell>;
  if (!user) return null;

  const dueToday = habits.filter(h => habitAppliesOn(h, now));
  const doneToday = dueToday.filter(h => logsByHabit.get(h.id)?.has(today)).length;

  return (
    <PageShell size="lg">
      <PageHeader
        icon={Repeat}
        title="Hábitos"
        subtitle={
          dueToday.length > 0
            ? `${doneToday} de ${dueToday.length} feitos hoje`
            : 'Marque o quadradinho no dia em que você fez.'
        }
        actions={
          <Button size="sm" onClick={openNew} className="h-8 gap-1.5 text-[13px]">
            <Plus className="w-4 h-4" /> Novo hábito
          </Button>
        }
      />

      {habits.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Repeat}
            title="Nenhum hábito ainda."
            hint="Comece por um só. Um hábito mantido vale mais que cinco abandonados."
            action={
              <Button size="sm" onClick={openNew} className="h-8 gap-1.5 text-[13px]">
                <Plus className="w-4 h-4" /> Criar o primeiro
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map(habit => {
            const marked = logsByHabit.get(habit.id) ?? new Set<string>();
            const streak = currentStreak(habit, marked, now);
            const rate = completionRate(habit, marked, 30, now);
            const isDueToday = habitAppliesOn(habit, now);
            const doneTodayHere = marked.has(today);
            const linkedGoal = habit.goal_id ? goals.find(g => g.id === habit.goal_id) : null;
            const color = habit.color || '#6366f1';

            return (
              <section key={habit.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-2.5 mb-3">
                  {/* O botão de hoje: o gesto principal da tela. */}
                  <button
                    type="button"
                    onClick={() => toggleDay(habit, today)}
                    disabled={!isDueToday}
                    aria-label={doneTodayHere ? `Desmarcar ${habit.title} hoje` : `Marcar ${habit.title} hoje`}
                    title={isDueToday ? 'Marcar hoje' : 'Este hábito não vale hoje'}
                    className={cn(
                      'shrink-0 w-9 h-9 rounded-xl grid place-items-center border-2 transition-all text-lg',
                      !isDueToday && 'opacity-30 cursor-not-allowed border-border',
                      isDueToday && doneTodayHere && 'text-white scale-105',
                      isDueToday && !doneTodayHere && 'border-dashed hover:scale-105'
                    )}
                    style={
                      isDueToday
                        ? doneTodayHere
                          ? { backgroundColor: color, borderColor: color }
                          : { borderColor: color }
                        : undefined
                    }
                  >
                    {habit.icon
                      ? <span>{habit.icon}</span>
                      : doneTodayHere
                        ? <Check className="w-4 h-4" strokeWidth={3} />
                        : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-semibold truncate">{habit.title}</h2>
                      {streak > 1 && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
                          <Flame className="w-3 h-3" /> {streak}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground truncate">
                      {habit.weekdays && habit.weekdays.length > 0
                        ? habit.weekdays.slice().sort().map(d => DAY_NAMES[d].slice(0, 3)).join(', ')
                        : 'Todo dia'}
                      {rate.expected > 0 && ` · ${rate.percent}% nos últimos 30 dias`}
                      {linkedGoal && ` · ${linkedGoal.title}`}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(habit)}
                    aria-label="Editar hábito"
                    className="text-muted-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeHabit(habit)}
                    aria-label="Excluir hábito"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Histórico: 12 semanas, uma coluna por semana. */}
                <div className="overflow-x-auto">
                  <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max">
                    {gridDays.map(day => {
                      const iso = toISODate(day);
                      const applies = habitAppliesOn(habit, day);
                      const isMarked = marked.has(iso);
                      const isFuture = iso > today;
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={!applies || isFuture}
                          onClick={() => toggleDay(habit, iso)}
                          title={`${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(day)}${isMarked ? ' · feito' : ''}`}
                          aria-label={`${iso}${isMarked ? ' feito' : ' não feito'}`}
                          className={cn(
                            'w-[11px] h-[11px] rounded-[3px] transition-colors',
                            !applies && 'bg-transparent',
                            applies && !isMarked && !isFuture && 'bg-muted hover:bg-muted-foreground/30',
                            applies && isFuture && 'bg-muted/40',
                            iso === today && 'ring-1 ring-primary ring-offset-1 ring-offset-background'
                          )}
                          style={applies && isMarked ? { backgroundColor: color } : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Formulário ────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && setFormOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Novo'} hábito</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>O que você quer manter?</Label>
              <Input
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveHabit()}
                placeholder="Ex.: beber 2L de água"
              />
            </div>

            <div>
              <Label>Em que dias?</Label>
              <div className="flex gap-1.5 mt-1.5">
                {DAY_LABELS.map((label, index) => {
                  const active = form.weekdays.includes(index);
                  return (
                    <Button
                      key={index}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setForm({
                        ...form,
                        weekdays: active
                          ? form.weekdays.filter(d => d !== index)
                          : [...form.weekdays, index],
                      })}
                      aria-label={DAY_NAMES[index]}
                      className="w-9 h-9 p-0"
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Nenhum dia marcado = vale todo dia.
              </p>
            </div>

            <div>
              <Label>Emoji</Label>
              <div className="grid grid-cols-8 gap-1 mt-1.5">
                {GROUP_EMOJIS.slice(0, 24).map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm({ ...form, icon: form.icon === emoji ? '' : emoji })}
                    aria-label={`Usar ${emoji}`}
                    className={cn(
                      'w-8 h-8 grid place-items-center rounded-md text-lg transition-colors hover:bg-accent',
                      form.icon === emoji && 'bg-primary/15 ring-2 ring-primary'
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Cor</Label>
              <div className="grid grid-cols-8 gap-2 mt-1.5">
                {PROJECT_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, color })}
                    aria-label={`Cor ${color}`}
                    className={cn(
                      'w-7 h-7 rounded-full transition-transform justify-self-center',
                      form.color === color && 'ring-2 ring-offset-2 ring-primary scale-110'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {goals.length > 0 && (
              <div>
                <Label>Serve a qual objetivo? (opcional)</Label>
                <Select
                  value={form.goalId?.toString() ?? 'none'}
                  onValueChange={(val: string | null) =>
                    setForm({ ...form, goalId: !val || val === 'none' ? null : parseInt(val, 10) })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {goals.map(goal => (
                      <SelectItem key={goal.id} value={goal.id.toString()}>{goal.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={saveHabit} disabled={!form.title.trim()}>
              {editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
