'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { createClient } from '@/app/lib/supabase/Client';
import { taskAPI } from '@/app/lib/taskAPI';
import { fetchUserProjects } from '@/app/lib/helpers';
import { fetchPreferences, savePreferences } from '@/app/lib/preferencesAPI';
import { useGroups } from '@/app/lib/GroupsContext';
import { useToast } from '@/app/components/Toast';
import { useUndoableDelete, useUndoableComplete } from '@/app/lib/hooks';
import { shouldSkipRealtimeFetch, skipRealtimeFetch } from '@/app/lib/taskEvents';
import { cn } from '@/app/lib/utils';
import { isBlockActiveNow, blockTimeLabel, blockDaysLabel, minutesUntilBlock, formatCountdown, sortBlocksByRelevance } from '@/app/lib/timeBlocks';
import { QuickCapture, type CaptureTarget, type CaptureDraft } from '@/app/components/QuickCapture';
import { TaskDetailPanel } from '@/app/components/TaskDetailPanel';
import { TaskRow } from './TaskRow';
import { AgendaRail } from './AgendaRail';
import { DropTarget, DropZone, PlanChip } from './DropTarget';
import { TaskActionsMenu, type PersonOption } from './TaskActionsMenu';
import { priorityMeta, type PriorityValue } from '@/app/lib/priority';
import { planBuckets, isDeferred, groupDeferred, anchorFor, toISODate, startOfDay, startOfWeek } from '@/app/lib/planning';
import { isRecurring, expandOccurrences } from '@/app/lib/recurrence';
import { habitAPI, indexLogs } from '@/app/lib/habitAPI';
import { goalAPI } from '@/app/lib/goalAPI';
import { TodayHabits } from './TodayHabits';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { Task, Project, UserPreferences, PlanHorizon, Habit, HabitLog, Goal } from '@/types/index';
import { Inbox, Clock, List as ListIcon, Folder, Eye, EyeOff, CheckCircle2, CalendarClock, CalendarDays, CalendarRange, UserCheck, ChevronDown, ChevronRight } from 'lucide-react';

type AppUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

/**
 * "Ana · 3 dias" — quem está com a tarefa e há quanto tempo.
 * O tempo de espera é a informação que faz você decidir cobrar ou não.
 */
function waitingLabel(task: Task): string {
  const who = task.assignee_name || 'alguém';
  if (!task.delegated_at) return who;

  const since = new Date(task.delegated_at);
  if (isNaN(since.getTime())) return who;

  const days = Math.floor((Date.now() - since.getTime()) / 86400000);
  if (days <= 0) return `${who} · hoje`;
  if (days === 1) return `${who} · 1 dia`;
  return `${who} · ${days} dias`;
}

export function HomeDashboard() {
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const { groups } = useGroups();

  const [user, setUser] = useState<AppUser | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [showLater, setShowLater] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [agendaDay, setAgendaDay] = useState(() => toISODate(startOfDay(new Date())));
  const [weekOffset, setWeekOffset] = useState(0);

  const pointer = useRef({ x: 0, y: 0 });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const undoableDelete = useUndoableDelete<Task>({
    deleteFn: (task) => taskAPI.deleteTask(task.id),
    onRemove: (task) => setTasks(prev => prev.filter(t => t.id !== task.id)),
    onRestore: (task) => setTasks(prev => [task, ...prev]),
    toast,
    getId: (task) => task.id,
  });

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user: authUser } } = await client.auth.getUser();
      if (!authUser) { router.push('/login'); return; }
      if (!alive) return;
      setUser(authUser as AppUser);

      const [taskList, projectList, preferences] = await Promise.all([
        taskAPI.getUserTasks(authUser.id, { showCompleted: true }),
        fetchUserProjects(authUser.id),
        fetchPreferences(authUser.id),
      ]);
      if (!alive) return;
      setTasks(taskList);
      setProjects(projectList);
      setPrefs(preferences);
      setLoading(false);

      // Hábitos e objetivos entram depois: a tela já é útil sem eles, então
      // não vale segurar o primeiro render esperando essas duas consultas.
      const [habitList, logList, goalList] = await Promise.all([
        habitAPI.list(authUser.id),
        habitAPI.recentLogs(authUser.id, 40),
        goalAPI.list(authUser.id),
      ]);
      if (!alive) return;
      setHabits(habitList);
      setHabitLogs(logList);
      setGoals(goalList);

      // Quem pode receber uma tarefa: os outros usuários cadastrados.
      // O RLS de todos continua valendo — delegar muda o responsável, não
      // dá acesso a nada que a pessoa já não pudesse ver.
      const { data: profiles } = await client
        .from('profiles')
        .select('id, full_name, email')
        .neq('id', authUser.id)
        .limit(50);
      if (!alive) return;
      setPeople(
        ((profiles as { id: string; full_name: string | null; email: string | null }[]) || [])
          .map(pr => ({ id: pr.id, name: pr.full_name || pr.email || 'Usuário' }))
      );
    })();
    return () => { alive = false; };
  }, [client, router]);

  const refetch = useCallback(async () => {
    if (!user) return;
    const list = await taskAPI.getUserTasks(user.id, { showCompleted: true });
    setTasks(list);
  }, [user]);

  // ── Realtime + relógio ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = client
      .channel('home-todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` },
        () => { if (!shouldSkipRealtimeFetch()) refetch(); })
      // Vínculos de dupla vinculação (task_view_groups) mudam sem tocar em
      // `todos` — sem isto, um link criado no quadro de projetos não
      // apareceria aqui até um F5.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_view_groups' },
        () => { if (!shouldSkipRealtimeFetch()) refetch(); })
      .subscribe();

    const onExternal = () => refetch();
    window.addEventListener('tasks-updated', onExternal);
    return () => { client.removeChannel(channel); window.removeEventListener('tasks-updated', onExternal); };
  }, [user, client, refetch]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const track = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener('pointermove', track);
    return () => document.removeEventListener('pointermove', track);
  }, []);

  // ── Preferências ─────────────────────────────────────────────────────────
  const setPref = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (user) savePreferences(user.id, next);
      return next;
    });
  }, [user]);

  const focusMode = prefs?.focus_mode ?? true;
  const captureKey = prefs?.last_capture_target ?? 'inbox';

  // ── Recortes de tarefa ───────────────────────────────────────────────────
  const timeGroups = useMemo(() => groups.filter(g => g.type === 'time'), [groups]);
  const listGroups = useMemo(() => groups.filter(g => g.type === 'list'), [groups]);

  const visible = useMemo(
    () => tasks.filter(t => showCompleted || !t.is_completed),
    [tasks, showCompleted]
  );

  /**
   * A Caixa de Entrada é o que ainda não tem lugar nenhum.
   * Sai dela: o que foi para um bloco/projeto, o que já tem hora marcada na
   * agenda, o que foi adiado para um horizonte futuro e o que foi delegado.
   * É exatamente o "desocupar a mente" — cada coisa que ganha destino some daqui.
   */
  const inboxTasks = useMemo(
    () => visible
      .filter(t => !t.project_id && !t.view_group_id)
      // Tem dia marcado (com ou sem hora) = já mora na agenda.
      .filter(t => !t.due_at && !t.due_date)
      .filter(t => !isDeferred(t, now))
      // Horizonte "semana" que já chegou tem seção própria ("Esta semana").
      .filter(t => t.plan_horizon !== 'week')
      .filter(t => t.status !== 'AGUARDANDO')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id),
    [visible, now]
  );

  /**
   * O que está marcado para hoje na agenda — com hora ou "dia todo", incluindo
   * as ocorrências de séries que caem hoje. Ordenado pela hora (sem hora primeiro).
   */
  const todayAgenda = useMemo(() => {
    const iso = toISODate(startOfDay(now));
    const dayStart = new Date(iso + 'T00:00:00');
    const dayEnd = new Date(iso + 'T23:59:59');
    const rows: Array<{ task: Task; override?: { text: string; overdue: boolean }; sortKey: number }> = [];

    for (const t of visible) {
      if (isRecurring(t)) {
        const hits = expandOccurrences(t, dayStart, dayEnd);
        if (hits.length === 0) continue;
        const at = t.due_at ? hits[0] : null;
        rows.push({
          task: t,
          override: at
            ? { text: `hoje ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(at)}`, overdue: !t.is_completed && at.getTime() < now.getTime() }
            : { text: 'hoje', overdue: false },
          sortKey: at ? at.getTime() : 0,
        });
      } else if (t.due_at) {
        const at = new Date(t.due_at);
        if (toISODate(at) === iso) rows.push({ task: t, sortKey: at.getTime() });
      } else if (t.due_date === iso) {
        rows.push({ task: t, sortKey: 0 });
      }
    }
    return rows.sort((a, b) => a.sortKey - b.sortKey);
  }, [visible, now]);

  /**
   * Guardado para "esta semana" sem escolher um dia: o horizonte de semana já
   * chegou (não está mais adiado) e a tarefa não tem data marcada.
   */
  const thisWeekTasks = useMemo(() => {
    const weekStartISO = toISODate(startOfWeek(now));
    return visible
      .filter(t => t.plan_horizon === 'week' && !isDeferred(t, now))
      .filter(t => !t.due_at && !t.due_date)
      .filter(t => !t.plan_date || t.plan_date >= weekStartISO)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  }, [visible, now]);

  /** O que está guardado para depois, agrupado por horizonte. */
  const laterGroups = useMemo(() => groupDeferred(visible, now), [visible, now]);
  const laterCount = useMemo(
    () => laterGroups.reduce((sum, g) => sum + g.tasks.length, 0),
    [laterGroups]
  );

  /** O que você passou para alguém e ainda não voltou. */
  const waitingTasks = useMemo(
    () => tasks
      .filter(t => t.status === 'AGUARDANDO' && !t.is_completed)
      .sort((a, b) => (a.delegated_at ?? '').localeCompare(b.delegated_at ?? '')),
    [tasks]
  );

  const buckets = useMemo(() => planBuckets(now), [now]);
  const habitMarks = useMemo(() => indexLogs(habitLogs), [habitLogs]);
  const todayISO = useMemo(() => toISODate(startOfDay(now)), [now]);

  const countByGroup = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of tasks) {
      if (t.is_completed) continue;
      if (t.view_group_id) map.set(t.view_group_id, (map.get(t.view_group_id) ?? 0) + 1);
      for (const id of t.linked_view_group_ids || []) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  const countByProject = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of tasks) {
      if (t.is_completed || !t.project_id) continue;
      map.set(t.project_id, (map.get(t.project_id) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const activeBlocks = useMemo(
    () => timeGroups.filter(g => isBlockActiveNow(g, now)),
    [timeGroups, now]
  );

  /**
   * Tudo que tem dia marcado — a agenda precisa da semana inteira, não só de
   * hoje, para marcar os pontinhos da faixa e abrir qualquer dia.
   */
  const scheduled = useMemo(
    () => visible.filter(t => t.due_at || t.due_date),
    [visible]
  );

  // ── Destinos da captura: Caixa de Entrada, blocos, listas, projetos ─────
  const captureTargets = useMemo<CaptureTarget[]>(() => [
    { key: 'inbox', label: 'Caixa de Entrada', kind: 'inbox', color: null },
    ...sortBlocksByRelevance(timeGroups, now).map(g => ({
      key: `group:${g.id}`,
      label: g.title,
      kind: 'group-time' as const,
      color: g.color,
      timeLabel: blockTimeLabel(g),
    })),
    ...listGroups.map(g => ({
      key: `group:${g.id}`, label: g.title, kind: 'group-list' as const, color: g.color,
    })),
    ...projects.map(p => ({
      key: `project:${p.id}`, label: p.name, kind: 'project' as const, color: p.color,
    })),
  ], [timeGroups, listGroups, projects, now]);

  // ── Criar tarefas ────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (drafts: CaptureDraft[]) => {
    if (!user) return;

    const parseKey = (key: string) => {
      if (key.startsWith('group:')) return { groupId: parseInt(key.slice(6), 10), projectId: null };
      if (key.startsWith('project:')) return { groupId: null, projectId: parseInt(key.slice(8), 10) };
      return { groupId: null, projectId: null };
    };

    const optimistic: Task[] = drafts.map((d, i) => {
      const { groupId, projectId } = parseKey(d.targetKey);
      return {
        id: -(Date.now() + i), // negativo: nunca colide com id real do banco
        user_id: user.id,
        title: d.title,
        is_completed: false,
        due_date: d.dueDate,
        due_at: d.dueAt ? d.dueAt.toISOString() : null,
        duration_min: d.durationMin ?? null,
        view_group_id: groupId,
        project_id: projectId,
        section_id: null,
        position: 99999,
        description: null,
        priority: d.priority,
        status: 'A_FAZER',
        status_changed_at: new Date().toISOString(),
        auto_review_reason: null,
        created_at: new Date().toISOString(),
        isSyncing: true,
      } as Task;
    });

    setTasks(prev => [...optimistic, ...prev]);
    skipRealtimeFetch(1500);

    const results = await Promise.all(drafts.map(d => {
      const { groupId, projectId } = parseKey(d.targetKey);
      return taskAPI.createTaskFrom(user.id, {
        title: d.title,
        groupId,
        projectId,
        dueDate: d.dueDate,
        dueAt: d.dueAt ? d.dueAt.toISOString() : null,
        durationMin: d.durationMin ?? (d.dueAt ? 30 : null),
        priority: d.priority,
        recur: d.recur,
      });
    }));

    setTasks(prev => {
      let next = prev;
      results.forEach((res, i) => {
        const tempId = optimistic[i].id;
        next = res.success && res.data
          ? next.map(t => (t.id === tempId ? { ...res.data!, isSyncing: false } : t))
          : next.filter(t => t.id !== tempId);
      });
      return next;
    });

    const failed = results.filter(r => !r.success).length;
    if (failed > 0) toast(`Erro ao criar ${failed} tarefa(s)`, 'error');
  }, [user, toast]);

  // ── Concluir, com desfazer ───────────────────────────────────────────────
  // Marcar feito é a ação mais repetida do app e a mais fácil de errar de
  // clique. Grava na hora e oferece "Desfazer" no toast por alguns segundos.
  const { toggle: toggleTask } = useUndoableComplete<Task>({
    apply: (id, completed) => setTasks(prev => prev.map(t => t.id === id
      ? { ...t, is_completed: completed, status: completed ? 'CONCLUIDO' : 'A_FAZER' }
      : t)),
    persist: (id, completed) => {
      skipRealtimeFetch(1200);
      // toggleTaskCompletion recebe o estado ATUAL e inverte, então passamos
      // o oposto do que queremos alcançar.
      return taskAPI.toggleTaskCompletion(id, !completed);
    },
    toast,
  });

  const deleteTask = useCallback((task: Task) => {
    undoableDelete.remove(task, 'Tarefa excluída');
  }, [undoableDelete]);

  // ── Arrastar e soltar ────────────────────────────────────────────────────
  const applyMove = useCallback(async (
    task: Task,
    patch: Partial<Task>,
    persist: () => Promise<{ success: boolean; error?: string }>,
    successMsg: string
  ) => {
    const original = { ...task };
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...patch, isSyncing: true } : t)));
    skipRealtimeFetch(1500);

    const res = await persist();
    if (res.success) {
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, isSyncing: false } : t)));
      toast(successMsg, 'success');
    } else {
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...original, isSyncing: false } : t)));
      toast(res.error ?? 'Erro ao mover tarefa', 'error');
    }
  }, [toast]);

  /** Guardar para depois: some da vista até o horizonte chegar. */
  const deferTask = useCallback((task: Task, horizon: PlanHorizon | null, date: Date | null) => {
    const anchor = horizon && date ? anchorFor(horizon, date) : null;
    applyMove(
      task,
      {
        plan_horizon: horizon,
        plan_date: anchor ? toISODate(anchor) : null,
        due_at: horizon ? null : task.due_at,
      },
      () => taskAPI.deferTask(task.id, horizon, anchor),
      horizon ? 'Guardada para depois' : 'De volta para agora'
    );
  }, [applyMove]);

  /** Passar para alguém: sai da sua vista e vira "Aguardando". */
  const delegateTask = useCallback((task: Task, personId: string | null) => {
    const person = people.find(p => p.id === personId);
    applyMove(
      task,
      {
        assignee_id: personId,
        assignee_name: person?.name,
        status: personId ? 'AGUARDANDO' : 'A_FAZER',
        delegated_at: personId ? new Date().toISOString() : null,
      },
      () => taskAPI.delegateTask(task.id, personId),
      personId ? `Aguardando ${person?.name ?? 'a pessoa'}` : 'Tarefa de volta com você'
    );
  }, [applyMove, people]);

  const dropOnKey = useCallback((task: Task, key: string) => {
    if (key === 'inbox') {
      const linked = task.linked_view_group_ids || [];
      if (!task.view_group_id && !task.project_id && linked.length === 0) return;
      applyMove(task, { view_group_id: null, project_id: null, section_id: null, linked_view_group_ids: [] },
        async () => {
          const move = await taskAPI.moveTaskToGroup(task.id, null);
          if (!move.success) return move;
          for (const id of linked) {
            const unlink = await taskAPI.unlinkTaskFromGroup(task.id, id);
            if (!unlink.success) return unlink;
          }
          return { success: true };
        },
        'Voltou para a Caixa de Entrada');
      return;
    }
    if (key.startsWith('group:')) {
      const groupId = parseInt(key.slice(6), 10);
      const linked = task.linked_view_group_ids || [];
      if (task.view_group_id === groupId || linked.includes(groupId)) return;
      const group = groups.find(g => g.id === groupId);

      // Com projeto: dupla vinculação (mesma regra do quadro de projetos —
      // ver ProjectWorkspace.execGroupDrop). O projeto não sai do lugar, a
      // tarefa só passa a também aparecer no grupo (lista ou bloco de tempo).
      if (task.project_id) {
        applyMove(task, { linked_view_group_ids: [...linked, groupId] },
          () => taskAPI.linkTaskToGroup(task.id, groupId),
          `Também em “${group?.title ?? 'bloco'}”`);
        return;
      }

      applyMove(task, { view_group_id: groupId, project_id: null, section_id: null },
        () => taskAPI.moveTaskToGroup(task.id, groupId), `Movida para “${group?.title ?? 'bloco'}”`);
      return;
    }
    if (key.startsWith('project:')) {
      const projectId = parseInt(key.slice(8), 10);
      if (task.project_id === projectId) return;
      const project = projects.find(p => p.id === projectId);
      applyMove(task, { project_id: projectId, view_group_id: null, section_id: null },
        () => taskAPI.moveTaskToProject(task.id, projectId), `Movida para “${project?.name ?? 'projeto'}”`);
    }
  }, [applyMove, groups, projects]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragTask(null);
    const task = event.active.data.current?.task as Task | undefined;
    if (!task) return;

    // A sidebar não faz parte deste DndContext, então detectamos o alvo pela
    // posição do cursor — mesmo truque que o workspace de projetos já usa.
    const el = document
      .elementsFromPoint(pointer.current.x, pointer.current.y)
      .find(e => e.closest('[data-sidebar-type]'))
      ?.closest('[data-sidebar-type]');
    if (el) {
      const type = el.getAttribute('data-sidebar-type');
      const id = el.getAttribute('data-sidebar-id');
      if (type && id) { dropOnKey(task, `${type}:${id}`); return; }
    }

    const over = event.over;
    if (!over) return;
    const overId = String(over.id);

    // Arrastou para um horizonte ("Semana que vem", "Setembro", "2027")
    if (overId.startsWith('plan:')) {
      const [, horizon, date] = overId.split(':');
      deferTask(task, horizon as PlanHorizon, new Date(date + 'T00:00:00'));
      return;
    }

    // Soltou num DIA da faixa: fica marcado para aquele dia, sem hora.
    // É o "vai ser quinta, o horário eu vejo depois".
    if (overId.startsWith('day:')) {
      const iso = overId.slice(4);
      const day = new Date(iso + 'T00:00:00');
      applyMove(
        task,
        { due_date: iso, due_at: null, duration_min: null, plan_horizon: null, plan_date: null },
        () => taskAPI.scheduleTaskAllDay(task.id, day),
        `Marcada para ${new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }).format(day)}`
      );
      return;
    }

    // Soltou num HORÁRIO: dia e hora exatos.
    if (overId.startsWith('slot:')) {
      const [, iso, h, m] = overId.split(':');
      const when = new Date(iso + 'T00:00:00');
      when.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
      const label = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(when);
      applyMove(
        task,
        { due_at: when.toISOString(), due_date: iso, plan_horizon: null, plan_date: null },
        () => taskAPI.scheduleTask(task.id, when, task.duration_min ?? 30),
        `Agendada para ${label}`
      );
      return;
    }

    if (over.data.current?.type === 'dropTarget') dropOnKey(task, String(over.data.current.key));
  }, [dropOnKey, applyMove, deferTask, now]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragTask((event.active.data.current?.task as Task) ?? null);
  }, []);

  /** Marcar/desmarcar um hábito direto do Dashboard. */
  const toggleHabit = useCallback(async (habit: Habit, day: string) => {
    if (!user) return;
    const wasMarked = habitMarks.get(habit.id)?.has(day) ?? false;

    const optimistic: HabitLog = {
      id: -Date.now(), habit_id: habit.id, user_id: user.id, day,
      created_at: new Date().toISOString(),
    };
    setHabitLogs(prev => wasMarked
      ? prev.filter(l => !(l.habit_id === habit.id && l.day === day))
      : [...prev, optimistic]);

    const res = wasMarked
      ? await habitAPI.unmark(habit.id, day)
      : await habitAPI.mark(user.id, habit.id, day);

    if (!res.success) {
      setHabitLogs(prev => wasMarked
        ? [...prev, optimistic]
        : prev.filter(l => !(l.habit_id === habit.id && l.day === day)));
      toast(res.error ?? 'Erro ao marcar hábito', 'error');
    }
  }, [user, habitMarks, toast]);

  /** Trocar a prioridade da tarefa (do ícone de exclamação ou do menu). */
  const setPriority = useCallback((task: Task, priority: PriorityValue | null) => {
    if ((task.priority ?? null) === priority) return;
    applyMove(
      task,
      { priority },
      () => taskAPI.updateTask(task.id, { priority }),
      priority ? `Prioridade: ${priorityMeta(priority)?.label}` : 'Prioridade removida'
    );
  }, [applyMove]);

  /** Pendurar a tarefa num objetivo (ou soltar dele). */
  const linkGoal = useCallback((task: Task, goalId: number | null) => {
    const goal = goalId ? goals.find(g => g.id === goalId) : null;
    applyMove(
      task,
      { goal_id: goalId },
      () => taskAPI.updateTask(task.id, { goal_id: goalId }),
      goal ? `Ligada a “${goal.title}”` : 'Solta do objetivo'
    );
  }, [applyMove, goals]);

  /** Menu de ações de uma linha — sempre o mesmo, em qualquer lista. */
  const rowActions = useCallback((task: Task) => (
    <TaskActionsMenu
      task={task}
      groups={groups}
      projects={projects}
      people={people}
      now={now}
      onDefer={deferTask}
      onDelegate={delegateTask}
      onMove={dropOnKey}
      onDelete={deleteTask}
      onSetPriority={setPriority}
      goals={goals}
      onLinkGoal={linkGoal}
    />
  ), [groups, projects, people, now, deferTask, delegateTask, dropOnKey, deleteTask, setPriority, goals, linkGoal]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 py-8 space-y-3">
        <div className="h-9 w-56 rounded-lg bg-muted animate-pulse" />
        <div className="h-[52px] rounded-xl bg-muted animate-pulse" />
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }
  if (!user) return null;

  const doneToday = tasks.filter(t => t.is_completed).length;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(now).replace(/^./, c => c.toUpperCase());

  // Agenda, hábitos e listas de destino: no desktop ficam sempre visíveis na
  // barra lateral; no mobile isso é conteúdo extra demais para vir logo de
  // cara, então some atrás de um toggle (ver <aside> abaixo) para priorizar
  // a lista de tarefas.
  const asideExtras = (
    <>
      <AgendaRail
        tasks={scheduled}
        now={now}
        selectedISO={agendaDay}
        onSelectDay={setAgendaDay}
        weekOffset={weekOffset}
        onWeekOffset={setWeekOffset}
        onSelect={setSelectedTask}
      />

      <TodayHabits
        habits={habits}
        marked={habitMarks}
        today={todayISO}
        now={now}
        onToggle={toggleHabit}
      />

      {timeGroups.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="ds-section-header px-1">Blocos de tempo</h2>
          {sortBlocksByRelevance(timeGroups, now).map(group => {
            const until = minutesUntilBlock(group, now);
            const active = isBlockActiveNow(group, now);
            return (
              <DropTarget
                key={group.id}
                id={`group:${group.id}`}
                label={group.title}
                icon={Clock}
                color={group.color}
                count={countByGroup.get(group.id) ?? 0}
                active={active}
                hint={active ? `agora · ${blockTimeLabel(group, now)}` : until !== null ? formatCountdown(until) : (blockTimeLabel(group, now) ?? blockDaysLabel(group))}
                onClick={() => router.push(`/?group=${group.id}`)}
              />
            );
          })}
        </section>
      )}

      {listGroups.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="ds-section-header px-1">Listas</h2>
          {listGroups.map(group => (
            <DropTarget
              key={group.id}
              id={`group:${group.id}`}
              label={group.title}
              icon={ListIcon}
              color={group.color}
              count={countByGroup.get(group.id) ?? 0}
              onClick={() => router.push(`/?group=${group.id}`)}
            />
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="ds-section-header px-1">Projetos</h2>
          {projects.map(project => (
            <DropTarget
              key={project.id}
              id={`project:${project.id}`}
              label={project.name}
              icon={Folder}
              color={project.color}
              count={countByProject.get(project.id) ?? 0}
              onClick={() => router.push(`/?project=${project.id}`)}
            />
          ))}
        </section>
      )}
    </>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragTask(null)}
    >
      <div className="w-full px-4 sm:px-6 xl:px-8 py-5">
        {/* ── Cabeçalho enxuto ───────────────────────────────────────── */}
        <header className="flex items-baseline gap-3 mb-4 flex-wrap">
          <h1 className="text-[19px] font-semibold">{dateLabel}</h1>
          <span className="text-[12px] text-muted-foreground">
            {inboxTasks.filter(t => !t.is_completed).length} na caixa de entrada
            {doneToday > 0 && ` · ${doneToday} concluída${doneToday > 1 ? 's' : ''}`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCompleted(v => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11.5px] transition-colors',
                showCompleted ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {showCompleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Concluídas
            </button>
            <button
              type="button"
              onClick={() => setPref('focus_mode', !focusMode)}
              title="No modo Agora, um bloco de tempo só aparece quando a hora dele chega."
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11.5px] transition-colors',
                focusMode ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Modo Agora
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          {/* ── Coluna principal: capturar e ver ────────────────────── */}
          <div className="min-w-0 space-y-5">
            <QuickCapture
              targets={captureTargets}
              activeKey={captureTargets.some(t => t.key === captureKey) ? captureKey : 'inbox'}
              onActiveKeyChange={(key) => setPref('last_capture_target', key)}
              onCreate={handleCreate}
            />

            {/* Hoje na agenda: o que foi marcado para hoje (com hora ou não) */}
            {todayAgenda.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <CalendarDays className="w-3.5 h-3.5 text-primary" />
                  <h2 className="text-[13px] font-semibold">Hoje na agenda</h2>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
                    {todayAgenda.filter(r => !r.task.is_completed).length}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {todayAgenda.map(({ task, override }) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      dragScope="today-agenda"
                      onToggle={toggleTask}
                      onSelect={setSelectedTask}
                      onDelete={deleteTask}
                      onSetPriority={setPriority}
                      whenOverride={override}
                      actions={rowActions(task)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Esta semana: guardado para a semana, sem um dia definido */}
            {thisWeekTasks.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <CalendarRange className="w-3.5 h-3.5 text-violet-500" />
                  <h2 className="text-[13px] font-semibold">Esta semana</h2>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
                    {thisWeekTasks.filter(t => !t.is_completed).length}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground/60">
                    sem dia definido
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {thisWeekTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      dragScope="this-week"
                      onToggle={toggleTask}
                      onSelect={setSelectedTask}
                      onDelete={deleteTask}
                      onSetPriority={setPriority}
                      actions={rowActions(task)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Caixa de Entrada */}
            <section>
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <Inbox className="w-3.5 h-3.5 text-primary" />
                <h2 className="text-[13px] font-semibold">Caixa de Entrada</h2>
                <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
                  {inboxTasks.filter(t => !t.is_completed).length}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground/60">
                  arraste para um bloco ou horário
                </span>
              </div>
              <DropZone id="zone:inbox" dropKey="inbox" className="border border-border bg-card overflow-hidden">
                {inboxTasks.length > 0 ? (
                  inboxTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      dragScope="inbox"
                      onToggle={toggleTask}
                      onSelect={setSelectedTask}
                      onDelete={deleteTask}
                      onSetPriority={setPriority}
                      actions={rowActions(task)}
                    />
                  ))
                ) : (
                  <div className="px-4 py-8 text-center">
                    <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-500/40" />
                    <p className="text-[13px] text-muted-foreground">Cabeça vazia. Tudo já tem lugar.</p>
                    <p className="text-[11.5px] text-muted-foreground/60 mt-1">
                      Arraste algo de volta para cá se mudar de ideia.
                    </p>
                  </div>
                )}
              </DropZone>
            </section>

            {/* Agora: só o bloco cuja hora chegou */}
            {activeBlocks.map(group => {
              const blockTasks = visible.filter(t => t.view_group_id === group.id || t.linked_view_group_ids?.includes(group.id));
              return (
                <section key={group.id}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                        style={{ backgroundColor: group.color || 'hsl(var(--primary))' }} />
                      <span className="relative inline-flex rounded-full h-2 w-2"
                        style={{ backgroundColor: group.color || 'hsl(var(--primary))' }} />
                    </span>
                    <h2 className="text-[13px] font-semibold">Agora · {group.title}</h2>
                    <span className="text-[11px] text-muted-foreground">{blockTimeLabel(group, now)}</span>
                  </div>
                  <DropZone
                    id={`zone:group:${group.id}`}
                    dropKey={`group:${group.id}`}
                    className="border-2 bg-card overflow-hidden"
                  >
                    <div style={{ borderColor: `color-mix(in srgb, ${group.color || '#2563eb'} 45%, transparent)` }}>
                    {blockTasks.length > 0 ? (
                      blockTasks.map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          dragScope={`group-${group.id}`}
                          accent={group.color}
                          onToggle={toggleTask}
                          onSelect={setSelectedTask}
                          onDelete={deleteTask}
                          onSetPriority={setPriority}
                          actions={rowActions(task)}
                        />
                      ))
                    ) : (
                      <p className="px-4 py-5 text-center text-[12.5px] text-muted-foreground/60">
                        Nada guardado para este horário.
                      </p>
                    )}
                    </div>
                  </DropZone>
                </section>
              );
            })}

            {/* Fora do modo Agora: todos os blocos, sempre abertos */}
            {!focusMode && timeGroups.filter(g => !isBlockActiveNow(g, now)).map(group => {
              const blockTasks = visible.filter(t => t.view_group_id === group.id || t.linked_view_group_ids?.includes(group.id));
              if (blockTasks.length === 0) return null;
              return (
                <section key={group.id}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Clock className="w-3.5 h-3.5" style={{ color: group.color || undefined }} />
                    <h2 className="text-[13px] font-semibold">{group.title}</h2>
                    <span className="text-[11px] text-muted-foreground">{blockTimeLabel(group, now)}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {blockTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        dragScope={`group-${group.id}`}
                        accent={group.color}
                        onToggle={toggleTask}
                        onSelect={setSelectedTask}
                        onDelete={deleteTask}
                        onSetPriority={setPriority}
                        actions={rowActions(task)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* ── Guardadas para depois ──────────────────────────────── */}
            {laterCount > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowLater(v => !v)}
                  className="flex items-center gap-2 mb-1.5 px-1 w-full text-left group/head"
                >
                  {showLater
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <CalendarClock className="w-3.5 h-3.5 text-violet-500" />
                  <h2 className="text-[13px] font-semibold">Depois</h2>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
                    {laterCount}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground/60 group-hover/head:text-muted-foreground">
                    {showLater ? 'esconder' : 'ver o que guardei'}
                  </span>
                </button>

                {showLater && (
                  <div className="space-y-3">
                    {laterGroups.map(bucket => (
                      <div key={bucket.key}>
                        <p className="text-[11px] font-medium text-muted-foreground px-1 mb-1">{bucket.label}</p>
                        <div className="rounded-xl border border-border bg-card overflow-hidden">
                          {bucket.tasks.map(task => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              dragScope={`later-${bucket.key}`}
                              onToggle={toggleTask}
                              onSelect={setSelectedTask}
                              onDelete={deleteTask}
                              onSetPriority={setPriority}
                              actions={rowActions(task)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Delegadas: você só volta aqui para cobrar ──────────── */}
            {waitingTasks.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowWaiting(v => !v)}
                  className="flex items-center gap-2 mb-1.5 px-1 w-full text-left group/head"
                >
                  {showWaiting
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                  <h2 className="text-[13px] font-semibold">Aguardando</h2>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
                    {waitingTasks.length}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground/60 group-hover/head:text-muted-foreground">
                    {showWaiting ? 'esconder' : 'ver o que deleguei'}
                  </span>
                </button>

                {showWaiting && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {waitingTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        dragScope="waiting"
                        onToggle={toggleTask}
                        onSelect={setSelectedTask}
                        onDelete={deleteTask}
                        onSetPriority={setPriority}
                        actions={rowActions(task)}
                        assigneeLabel={waitingLabel(task)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── Coluna lateral: agenda de hoje e gavetas ─────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-4">
            {/* Horizontes: arraste para cá o que não é para agora. */}
            <section>
              <h2 className="ds-section-header px-1 mb-1.5">Deixar para depois</h2>
              <div className="flex flex-wrap gap-1.5">
                {buckets.map(bucket => (
                  <PlanChip key={bucket.key} id={bucket.key} label={bucket.short} />
                ))}
              </div>
            </section>

            {/* Desktop: agenda/hábitos/listas sempre visíveis. */}
            <div className="hidden lg:block space-y-4">{asideExtras}</div>

            {/* Mobile: mesmo conteúdo, recolhido por padrão — prioriza a
                lista de tarefas, que já veio antes na coluna principal. */}
            <div className="lg:hidden">
              <Collapsible>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card text-[12.5px] font-medium group">
                  <span>Agenda, hábitos e listas</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">{asideExtras}</CollapsibleContent>
              </Collapsible>
            </div>
          </aside>
        </div>
      </div>

      {selectedTask && user && (
        <TaskDetailPanel
          task={selectedTask}
          groups={groups}
          currentUserId={user.id}
          projectOwnerId={null}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
            setSelectedTask(updated);
          }}
          onMoveToGroup={(groupId) => dropOnKey(selectedTask, `group:${groupId}`)}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {dragTask && (
          <TaskRow
            task={dragTask}
            dragScope="overlay"
            onToggle={() => {}}
            onSelect={() => {}}
            onDelete={() => {}}
            isOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
