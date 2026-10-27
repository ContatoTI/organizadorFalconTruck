'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import type { EventInput, EventDropArg, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import type { EventResizeDoneArg, DropArg } from '@fullcalendar/interaction';

import { createClient } from '@/src/lib/supabase/Client';
import { taskAPI } from '@/src/views/tarefas/clienteTarefas';
import { agendaAPI } from './clienteAgenda';
import { useGroups } from '@/src/views/grupos/GroupsContext';
import { useToast } from '@/src/components/Toast';
import { shouldSkipRealtimeFetch, skipRealtimeFetch } from '@/src/views/tarefas/taskEvents';
import { cn } from '@/src/lib/utils';
import { TaskDetailPanel } from '@/src/views/tarefas/TaskDetailPanel';
import { parseCapture } from '@/src/models/tarefas/quickParse';
import { expandOccurrences, isRecurring, describeRecurrence } from '@/src/models/tarefas/recurrence';
import { toISODate } from '@/src/lib/planning';
import { PRIORITIES } from '@/src/lib/priority';
import type { Task, Project, TaskOccurrence } from '@/types/index';
import { projectAPI } from '@/src/views/projetos/clienteProjetos';
import {
  ChevronLeft, ChevronRight, Search, Inbox, GripVertical, CalendarX2, Plus, X, Repeat, Layers,
} from 'lucide-react';

type AppUser = { id: string; email?: string };
type ViewKey = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';

const VIEW_LABEL: Record<ViewKey, string> = {
  timeGridDay: 'Dia',
  timeGridWeek: 'Semana',
  dayGridMonth: 'Mês',
};

/** Como agrupar a fila de tarefas sem horário. */
type GroupByKey = 'none' | 'list' | 'time' | 'priority' | 'created';

const GROUP_BY_LABEL: Record<GroupByKey, string> = {
  none: 'Sem agrupamento',
  list: 'Por lista',
  time: 'Por bloco de tempo',
  priority: 'Por prioridade',
  created: 'Por data de criação',
};

const DEFAULT_DURATION = 30;

/** Cor do evento: herda do bloco/lista de origem, senão usa a primária. */
function colorFor(task: Task, groupColors: Map<number, string>): string {
  if (task.view_group_id) return groupColors.get(task.view_group_id) ?? '#2563eb';
  if (task.priority === 'urgente') return '#dc2626';
  if (task.priority === 'alta') return '#f97316';
  return '#2563eb';
}

export function PainelCalendario() {
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const { groups } = useGroups();

  const calendarRef = useRef<FullCalendar>(null);
  const unscheduledRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<AppUser | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>('timeGridWeek');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByKey>('none');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // A janela que o calendário está mostrando. É o intervalo que a série
  // precisa expandir — expandir o ano inteiro seria desperdício.
  const [range, setRange] = useState<{ from: Date; to: Date } | null>(null);
  const [occurrences, setOccurrences] = useState<TaskOccurrence[]>([]);

  // Criação rápida ao clicar num horário vazio
  const [draft, setDraft] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const draftInputRef = useRef<HTMLInputElement>(null);

  const groupColors = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of groups) if (g.color) map.set(g.id, g.color);
    return map;
  }, [groups]);

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user: authUser } } = await client.auth.getUser();
      if (!authUser) { router.push('/login'); return; }
      if (!alive) return;
      setUser(authUser as AppUser);
      const [taskList, projectList] = await Promise.all([
        taskAPI.getUserTasks({ showCompleted: true }),
        projectAPI.getOwnAndMemberProjects(),
      ]);
      if (!alive) return;
      setTasks(taskList);
      setProjects(projectList);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [client, router]);

  const refetch = useCallback(async () => {
    if (!user) return;
    setTasks(await taskAPI.getUserTasks({ showCompleted: true }));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = client
      .channel('calendar-todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` },
        () => { if (!shouldSkipRealtimeFetch()) refetch(); })
      .subscribe();
    const onExternal = () => refetch();
    window.addEventListener('tasks-updated', onExternal);
    return () => { client.removeChannel(channel); window.removeEventListener('tasks-updated', onExternal); };
  }, [user, client, refetch]);

  // Estado das ocorrências (concluída/pulada) só do período visível.
  useEffect(() => {
    if (!user || !range) return;
    let alive = true;
    (async () => {
      const list = await agendaAPI.getOccurrences(toISODate(range.from), toISODate(range.to));
      if (alive) setOccurrences(list);
    })();
    return () => { alive = false; };
  }, [user, range]);

  const occurrenceState = useMemo(() => {
    const map = new Map<string, TaskOccurrence>();
    for (const o of occurrences) map.set(`${o.task_id}:${o.occurrence_date}`, o);
    return map;
  }, [occurrences]);

  // Lembra a última visão e o agrupamento usados — não faz sentido reconfigurar
  // a cada visita.
  useEffect(() => {
    const stored = localStorage.getItem('calendarView') as ViewKey | null;
    if (stored && stored in VIEW_LABEL) {
      setView(stored);
      calendarRef.current?.getApi().changeView(stored);
    }
    const storedGroup = localStorage.getItem('calendarGroupBy') as GroupByKey | null;
    if (storedGroup && storedGroup in GROUP_BY_LABEL) setGroupBy(storedGroup);
  }, []);

  const changeGroupBy = useCallback((next: GroupByKey) => {
    setGroupBy(next);
    localStorage.setItem('calendarGroupBy', next);
  }, []);

  // ── Tarefas sem horário: a fila de espera à esquerda ────────────────────
  const unscheduled = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks
      .filter(t => !t.due_at && (showCompleted || !t.is_completed))
      .filter(t => !term || t.title.toLowerCase().includes(term))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  }, [tasks, search, showCompleted]);

  // Quebra a fila em seções conforme o agrupamento escolhido. Cada seção já vem
  // ordenada por posição; seções vazias somem.
  const unscheduledSections = useMemo(() => {
    type Section = { key: string; label: string | null; color?: string | null; tasks: Task[] };
    const bySort = (a: Task, b: Task) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id;
    const sorted = [...unscheduled].sort(bySort);

    if (groupBy === 'none') {
      return [{ key: 'all', label: null, tasks: sorted } as Section];
    }

    if (groupBy === 'priority') {
      const known = [...PRIORITIES].reverse(); // urgente → baixa
      const sections: Section[] = known.map(p => ({
        key: p.value,
        label: p.label,
        tasks: sorted.filter(t => t.priority === p.value),
      }));
      sections.push({
        key: 'sem-prioridade',
        label: 'Sem prioridade',
        tasks: sorted.filter(t => !PRIORITIES.some(p => p.value === t.priority)),
      });
      return sections.filter(s => s.tasks.length > 0);
    }

    if (groupBy === 'list' || groupBy === 'time') {
      const wanted = groups.filter(g => g.type === (groupBy === 'list' ? 'list' : 'time'));
      const wantedIds = new Set(wanted.map(g => g.id));
      const sections: Section[] = wanted.map(g => ({
        key: `g${g.id}`,
        label: g.title,
        color: g.color,
        tasks: sorted.filter(t => t.view_group_id === g.id),
      }));
      sections.push({
        key: 'sem-grupo',
        label: groupBy === 'list' ? 'Sem lista' : 'Sem bloco de tempo',
        tasks: sorted.filter(t => !t.view_group_id || !wantedIds.has(t.view_group_id)),
      });
      return sections.filter(s => s.tasks.length > 0);
    }

    // created: buckets relativos a hoje
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 86_400_000;
    const bucketOf = (iso: string) => {
      const t = new Date(iso).getTime();
      if (isNaN(t)) return 4;
      if (t >= startOfToday) return 0;
      if (t >= startOfToday - DAY) return 1;
      if (t >= startOfToday - 7 * DAY) return 2;
      if (t >= startOfToday - 30 * DAY) return 3;
      return 4;
    };
    const bucketLabels = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias', 'Mais antigo'];
    return bucketLabels
      .map((label, i) => ({ key: `b${i}`, label, tasks: sorted.filter(t => bucketOf(t.created_at) === i) } as Section))
      .filter(s => s.tasks.length > 0);
  }, [unscheduled, groupBy, groups]);

  const renderUnscheduledTask = (task: Task) => (
    <div
      key={task.id}
      data-task-id={task.id}
      data-task-title={task.title}
      data-task-duration={task.duration_min ?? DEFAULT_DURATION}
      onClick={() => setSelectedTask(task)}
      className={cn(
        'group flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-border bg-background',
        'cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-all',
        task.is_completed && 'opacity-50'
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: colorFor(task, groupColors) }}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0" />
      <span className={cn('flex-1 min-w-0 text-[12.5px] truncate', task.is_completed && 'line-through')}>
        {task.title}
      </span>
    </div>
  );

  // Torna a fila arrastável para dentro da grade (API externa do FullCalendar).
  useEffect(() => {
    if (!unscheduledRef.current) return;
    const dragger = new Draggable(unscheduledRef.current, {
      itemSelector: '[data-task-id]',
      eventData: (el) => ({
        title: el.getAttribute('data-task-title') ?? '',
        duration: { minutes: parseInt(el.getAttribute('data-task-duration') || String(DEFAULT_DURATION), 10) },
        extendedProps: { taskId: parseInt(el.getAttribute('data-task-id')!, 10) },
      }),
    });
    return () => dragger.destroy();
  }, []);

  // ── Eventos da grade ────────────────────────────────────────────────────
  const events = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];
    const visibleTasks = tasks.filter(t => (t.due_at || t.due_date) && (showCompleted || !t.is_completed));

    for (const t of visibleTasks) {
      const color = colorFor(t, groupColors);
      const minutes = t.duration_min && t.duration_min > 0 ? t.duration_min : DEFAULT_DURATION;

      // Compromisso único: um evento, como sempre foi.
      if (!isRecurring(t) || !range) {
        if (t.due_at) {
          const start = new Date(t.due_at);
          out.push({
            id: String(t.id),
            title: t.title,
            start,
            end: new Date(start.getTime() + minutes * 60000),
            backgroundColor: t.is_completed ? '#94a3b8' : color,
            borderColor: t.is_completed ? '#94a3b8' : color,
            classNames: t.is_completed ? ['fc-task-done'] : [],
            extendedProps: { taskId: t.id, occurrenceISO: null, recurring: false },
          });
        } else {
          out.push({
            id: String(t.id),
            title: t.title,
            start: t.due_date!,
            allDay: true,
            backgroundColor: t.is_completed ? '#94a3b8' : color,
            borderColor: t.is_completed ? '#94a3b8' : color,
            classNames: t.is_completed ? ['fc-task-done'] : [],
            extendedProps: { taskId: t.id, occurrenceISO: null, recurring: false },
          });
        }
        continue;
      }

      // Série: uma ocorrência por data que cai na janela visível.
      for (const date of expandOccurrences(t, range.from, range.to)) {
        const iso = toISODate(date);
        const state = occurrenceState.get(`${t.id}:${iso}`);
        if (state?.is_skipped) continue;

        const isFirst = t.due_at ? toISODate(new Date(t.due_at)) === iso : t.due_date === iso;
        const done = state?.is_completed ?? (isFirst ? t.is_completed : false);
        const allDay = !t.due_at;

        out.push({
          // Id por ocorrência: sem isso o FullCalendar acha que são o mesmo
          // evento e desenha apenas um.
          id: `${t.id}@${iso}`,
          title: t.title,
          start: allDay ? iso : date,
          end: allDay ? undefined : new Date(date.getTime() + minutes * 60000),
          allDay,
          backgroundColor: done ? '#94a3b8' : color,
          borderColor: done ? '#94a3b8' : color,
          classNames: done ? ['fc-task-done', 'fc-task-repeat'] : ['fc-task-repeat'],
          // Ocorrência não se arrasta: mover uma data de uma série exigiria
          // decidir "só esta ou todas", e essa pergunta atrapalha mais do que
          // ajuda. Para mudar a série, abra o compromisso.
          editable: false,
          extendedProps: { taskId: t.id, occurrenceISO: iso, recurring: true },
        });
      }
    }

    return out;
  }, [tasks, groupColors, showCompleted, range, occurrenceState]);

  // ── Persistência de agendamento ─────────────────────────────────────────
  const persistSchedule = useCallback(async (
    taskId: number, start: Date | null, durationMin: number | null, revert: () => void
  ) => {
    const before = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.map(t => t.id === taskId
      ? {
          ...t,
          due_at: start ? start.toISOString() : null,
          due_date: start
            ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
            : null,
          duration_min: durationMin,
          isSyncing: true,
        }
      : t));
    skipRealtimeFetch(1500);

    const res = await agendaAPI.scheduleTask(taskId, start, durationMin);
    if (res.success) {
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, isSyncing: false } : t)));
    } else {
      revert();
      if (before) setTasks(prev => prev.map(t => (t.id === taskId ? { ...before, isSyncing: false } : t)));
      toast(res.error ?? 'Erro ao agendar', 'error');
    }
  }, [tasks, toast]);

  const persistAllDay = useCallback(async (taskId: number, day: Date, revert: () => void) => {
    const before = tasks.find(t => t.id === taskId);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    setTasks(prev => prev.map(t => (t.id === taskId
      ? { ...t, due_at: null, duration_min: null, due_date: iso, isSyncing: true }
      : t)));
    skipRealtimeFetch(1500);

    const res = await agendaAPI.scheduleTaskAllDay(taskId, day);
    if (res.success) {
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, isSyncing: false } : t)));
    } else {
      revert();
      if (before) setTasks(prev => prev.map(t => (t.id === taskId ? { ...before, isSyncing: false } : t)));
      toast(res.error ?? 'Erro ao agendar', 'error');
    }
  }, [tasks, toast]);

  const handleEventDrop = useCallback((arg: EventDropArg) => {
    const taskId = arg.event.extendedProps.taskId as number;
    if (arg.event.allDay || !arg.event.start) {
      // Arrastou para a faixa "dia todo": perde a hora, mantém o dia.
      if (arg.event.start) persistAllDay(taskId, arg.event.start, arg.revert);
      return;
    }
    const minutes = arg.event.end
      ? Math.round((arg.event.end.getTime() - arg.event.start.getTime()) / 60000)
      : DEFAULT_DURATION;
    persistSchedule(taskId, arg.event.start, minutes, arg.revert);
  }, [persistSchedule]);

  const handleEventResize = useCallback((arg: EventResizeDoneArg) => {
    const taskId = arg.event.extendedProps.taskId as number;
    if (!arg.event.start || !arg.event.end) return;
    const minutes = Math.round((arg.event.end.getTime() - arg.event.start.getTime()) / 60000);
    persistSchedule(taskId, arg.event.start, minutes, arg.revert);
  }, [persistSchedule]);

  /** Soltou uma tarefa da fila de espera dentro da grade. */
  const handleExternalDrop = useCallback((info: DropArg) => {
    const taskId = parseInt(info.draggedEl.getAttribute('data-task-id') || '', 10);
    if (isNaN(taskId)) return;
    const task = tasks.find(t => t.id === taskId);
    if (info.allDay) {
      persistAllDay(taskId, info.date, () => {});
    } else {
      const minutes = task?.duration_min && task.duration_min > 0 ? task.duration_min : DEFAULT_DURATION;
      persistSchedule(taskId, info.date, minutes, () => {});
    }
    toast('Tarefa agendada', 'success');
  }, [tasks, persistSchedule, persistAllDay, toast]);

  /** Selecionou uma faixa vazia: abre o campo de título ali mesmo. */
  const handleSelect = useCallback((arg: DateSelectArg) => {
    setDraft({ start: arg.start, end: arg.end, allDay: arg.allDay });
    setDraftTitle('');
    requestAnimationFrame(() => draftInputRef.current?.focus());
  }, []);

  const createDraft = useCallback(async () => {
    if (!draft || !user) return;
    const parsed = parseCapture(draftTitle);
    const title = parsed.title.trim();
    if (!title) return;

    const minutes = draft.allDay
      ? null
      : Math.max(15, Math.round((draft.end.getTime() - draft.start.getTime()) / 60000));

    setDraft(null);
    setDraftTitle('');
    skipRealtimeFetch(1500);

    const res = await taskAPI.createTaskFrom({
      title,
      dueAt: draft.allDay ? null : draft.start.toISOString(),
      dueDate: `${draft.start.getFullYear()}-${String(draft.start.getMonth() + 1).padStart(2, '0')}-${String(draft.start.getDate()).padStart(2, '0')}`,
      durationMin: minutes,
      priority: parsed.priority,
    });
    if (res.success && res.data) {
      setTasks(prev => [res.data as Task, ...prev]);
      calendarRef.current?.getApi().unselect();
    } else {
      toast(res.error ?? 'Erro ao criar tarefa', 'error');
    }
  }, [draft, draftTitle, user, toast]);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const taskId = arg.event.extendedProps.taskId as number;
    const task = tasks.find(t => t.id === taskId);
    if (task) setSelectedTask(task);
  }, [tasks]);

  /**
   * Concluir UMA data de uma série, sem tocar nas outras.
   * A primeira data cai no is_completed da própria tarefa, que é como as
   * tarefas sem repetição sempre funcionaram.
   */
  const toggleOccurrence = useCallback(async (taskId: number, iso: string, done: boolean) => {
    if (!user) return;
    const key = `${taskId}:${iso}`;
    const before = occurrenceState.get(key);

    setOccurrences(prev => {
      const rest = prev.filter(o => !(o.task_id === taskId && o.occurrence_date === iso));
      return [...rest, {
        id: before?.id ?? -Date.now(),
        task_id: taskId,
        user_id: user.id,
        occurrence_date: iso,
        is_completed: done,
        completed_at: done ? new Date().toISOString() : null,
        is_skipped: before?.is_skipped ?? false,
        moved_to: before?.moved_to ?? null,
        created_at: before?.created_at ?? new Date().toISOString(),
      }];
    });

    const res = await agendaAPI.setOccurrenceState(taskId, iso, { completed: done });
    if (!res.success) {
      setOccurrences(prev => {
        const rest = prev.filter(o => !(o.task_id === taskId && o.occurrence_date === iso));
        return before ? [...rest, before] : rest;
      });
      toast(res.error ?? 'Erro ao marcar ocorrência', 'error');
    }
  }, [user, occurrenceState, toast]);

  /** Tira a tarefa da agenda e devolve para a fila de espera. */
  const unschedule = useCallback((task: Task) => {
    persistSchedule(task.id, null, null, () => {});
    toast('Tarefa voltou para a fila', 'success');
  }, [persistSchedule, toast]);

  const changeView = useCallback((next: ViewKey) => {
    setView(next);
    localStorage.setItem('calendarView', next);
    calendarRef.current?.getApi().changeView(next);
  }, []);

  const nav = useCallback((action: 'prev' | 'next' | 'today') => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === 'prev') api.prev();
    else if (action === 'next') api.next();
    else api.today();
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Barra de controle ─────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => nav('today')}
          className="h-8 px-3 rounded-lg border border-border text-[13px] font-medium hover:bg-accent transition-colors"
        >
          Hoje
        </button>
        <div className="flex items-center">
          <button type="button" onClick={() => nav('prev')} aria-label="Anterior"
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => nav('next')} aria-label="Próximo"
            className="h-8 w-8 grid place-items-center rounded-lg hover:bg-accent transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <h1 className="text-[16px] font-semibold ml-1 capitalize">{title}</h1>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-[hsl(var(--primary))]"
            />
            Concluídas
          </label>
          <div className="flex items-center p-0.5 rounded-lg bg-muted">
            {(Object.keys(VIEW_LABEL) as ViewKey[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => changeView(key)}
                className={cn(
                  'h-7 px-3 rounded-md text-[12.5px] font-medium transition-colors',
                  view === key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {VIEW_LABEL[key]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Fila de espera: arraste daqui para a grade ───────────────── */}
        <aside className="w-[248px] shrink-0 border-r border-border bg-card hidden md:flex flex-col">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="w-4 h-4 text-primary" />
              <h2 className="text-[13px] font-semibold flex-1">Sem horário</h2>
              <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full tabular-nums">
                {unscheduled.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="w-full h-7 pl-7 pr-2 rounded-md border border-border bg-background text-[12.5px] outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              <select
                value={groupBy}
                onChange={(e) => changeGroupBy(e.target.value as GroupByKey)}
                aria-label="Agrupar tarefas por"
                className="flex-1 min-w-0 h-7 px-1.5 rounded-md border border-border bg-background text-[12px] outline-none focus:border-primary transition-colors cursor-pointer"
              >
                {(Object.keys(GROUP_BY_LABEL) as GroupByKey[]).map(k => (
                  <option key={k} value={k}>{GROUP_BY_LABEL[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div ref={unscheduledRef} className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-1">
                {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-md bg-muted animate-pulse" />)}
              </div>
            ) : unscheduled.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-muted-foreground/60">
                {search ? 'Nada encontrado.' : 'Tudo já tem horário.'}
              </p>
            ) : (
              <div className="space-y-3">
                {unscheduledSections.map(section => (
                  <div key={section.key} className="space-y-1">
                    {section.label && (
                      <div className="flex items-center gap-1.5 px-1 pt-0.5">
                        {section.color && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: section.color }} />
                        )}
                        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">{section.tasks.length}</span>
                      </div>
                    )}
                    {section.tasks.map(renderUnscheduledTask)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="px-3 py-2 text-[11px] text-muted-foreground/60 border-t border-border">
            Arraste para a grade para marcar hora.
          </p>
        </aside>

        {/* ── A grade ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 relative fc-shell">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={view}
            headerToolbar={false}
            locale="pt-br"
            firstDay={0}
            height="100%"
            expandRows
            nowIndicator
            allDaySlot
            allDayText="dia todo"
            slotDuration="00:30:00"
            slotLabelInterval="01:00"
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            scrollTime="07:00:00"
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            buttonText={{ today: 'Hoje' }}
            noEventsText="Nada agendado"
            events={events}
            editable
            droppable
            selectable
            selectMirror
            dayMaxEvents={3}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            drop={handleExternalDrop}
            select={handleSelect}
            eventClick={handleEventClick}
            eventContent={(arg) => {
              const { taskId, occurrenceISO, recurring } = arg.event.extendedProps as {
                taskId: number; occurrenceISO: string | null; recurring: boolean;
              };
              const done = arg.event.classNames.includes('fc-task-done');

              return (
                <div className="flex items-start gap-1 w-full overflow-hidden px-0.5">
                  {recurring && occurrenceISO && (
                    // Marcar só esta data. O clique não pode subir para o
                    // evento, senão abriria o painel em vez de concluir.
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleOccurrence(taskId, occurrenceISO, !done); }}
                      aria-label={done ? 'Reabrir esta data' : 'Concluir esta data'}
                      title={done ? 'Reabrir esta data' : 'Concluir só esta data'}
                      className={cn(
                        'mt-[2px] shrink-0 w-[11px] h-[11px] rounded-[3px] border grid place-items-center transition-colors',
                        done ? 'bg-white/90 border-white/90' : 'border-white/70 hover:bg-white/30'
                      )}
                    >
                      {done && (
                        <svg viewBox="0 0 12 12" className="w-2 h-2 text-slate-600" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M2 6.5 L4.5 9 L10 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {arg.timeText && <b className="mr-1 opacity-90">{arg.timeText}</b>}
                    {arg.event.title}
                  </span>
                  {recurring && <Repeat className="w-2.5 h-2.5 mt-[2px] shrink-0 opacity-70" />}
                </div>
              );
            }}
            datesSet={(arg) => {
              setTitle(arg.view.title);
              setRange({ from: arg.start, to: arg.end });
            }}
          />

          {/* ── Criação rápida no horário selecionado ───────────────── */}
          {draft && (
            <div className="absolute inset-0 z-30 bg-black/20 flex items-center justify-center p-4"
              onClick={() => { setDraft(null); calendarRef.current?.getApi().unselect(); }}>
              <div
                className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="w-4 h-4 text-primary" />
                  <p className="text-[13px] font-semibold flex-1">
                    {draft.allDay
                      ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(draft.start)
                      : `${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).format(draft.start)} · ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(draft.start)}–${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(draft.end)}`}
                  </p>
                  <button type="button" onClick={() => { setDraft(null); calendarRef.current?.getApi().unselect(); }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  ref={draftInputRef}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); createDraft(); }
                    if (e.key === 'Escape') { setDraft(null); calendarRef.current?.getApi().unselect(); }
                  }}
                  placeholder="O que acontece nesse horário?"
                  className="w-full h-10 px-3 rounded-lg border-2 border-primary/30 focus:border-primary bg-background text-[14px] outline-none transition-colors"
                />
                <p className="mt-2 text-[11px] text-muted-foreground">Enter cria · Esc cancela</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedTask && user && (
        <TaskDetailPanel
          task={selectedTask}
          groups={groups}
          currentUserId={user.id}
          projectOwnerId={projects.find(p => p.id === selectedTask.project_id)?.owner_id ?? null}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
            setSelectedTask(updated);
          }}
          onMoveToGroup={async (groupId) => {
            await taskAPI.moveTaskToGroup(selectedTask.id, groupId);
            refetch();
          }}
        />
      )}

      {/* Botão para desagendar, visível quando há tarefa aberta com horário */}
      {selectedTask?.due_at && (
        <button
          type="button"
          onClick={() => { unschedule(selectedTask); setSelectedTask(null); }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 h-9 px-4 rounded-full bg-card border border-border shadow-lg text-[13px] hover:border-destructive hover:text-destructive transition-colors"
        >
          <CalendarX2 className="w-4 h-4" />
          Tirar do calendário
        </button>
      )}
    </div>
  );
}
