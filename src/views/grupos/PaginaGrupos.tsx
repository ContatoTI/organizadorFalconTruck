'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createClient } from '@/src/lib/supabase/Client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGroups } from '@/src/views/grupos/GroupsContext';
import { Plus, X, Edit2, Trash2, Clock, List, Eye, EyeOff, Check, Smile } from 'lucide-react';
import { grupoAPI } from './clienteGrupos';
import { montarDadosGrupo } from '@/src/models/grupos/grupos';
import { GroupIcon, PROJECT_COLORS, GROUP_EMOJIS, cn, getSoftCardStyle } from '@/src/lib/utils';
import { parseSchedules, blockDaysLabel } from '@/src/models/grupos/timeBlocks';
import type { BlockSchedule } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageShell, PageHeader, EmptyState, PageSkeleton } from '@/src/components/ui/Page';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

function getRoundedTime(offsetMinutes = 0): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  const m = Math.round(d.getMinutes() / 30) * 30;
  d.setMinutes(m, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Atalhos para não obrigar a digitar hora em dois campos. */
const TIME_PRESETS = [
  { label: 'Manhã', start: '08:00', end: '12:00' },
  { label: 'Almoço', start: '12:00', end: '13:30' },
  { label: 'Tarde', start: '13:30', end: '18:00' },
  { label: 'Noite', start: '19:00', end: '22:00' },
] as const;

/** Atalhos de dias — cobrem quase todos os blocos reais. */
const DAY_PRESETS = [
  { label: 'Todo dia', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Dias úteis', days: [1, 2, 3, 4, 5] },
  { label: 'Fim de semana', days: [0, 6] },
] as const;

function ConteudoGrupos() {
  const { groups, loading, refreshGroups, addGroup, updateGroup, deleteGroup: deleteGroupFromState } = useGroups();
  const [user, setUser] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'list' as 'time' | 'list',
    icon: '',
    color: '#6366f1',
    start_time: getRoundedTime(0),
    end_time: getRoundedTime(60),
    recurrence_type: 'weekly',
    recurrence_days: [] as number[],
    schedules: [] as BlockSchedule[],
    show_on_dashboard: true,
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = createClient();
  
  // Refs para evitar closure
  const userRef = useRef(user);
  const formDataRef = useRef(formData);
  const editingRef = useRef(editingGroup);
  
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    editingRef.current = editingGroup;
  }, [editingGroup]);

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
    const editing = editingRef.current;
    
    if (!currentForm.title.trim() || !currentUser) return;

    const groupData = montarDadosGrupo(currentForm);

    if (editing) {
      const res = await grupoAPI.update(editing.id, groupData);
      if (!res.success) {
        console.error('Error updating group:', res.error);
        return;
      }
      updateGroup(editing.id, groupData);
    } else {
      const res = await grupoAPI.create(groupData);
      if (!res.success) {
        console.error('Error creating group:', res.error);
        return;
      }

      if (res.data) {
        addGroup(res.data);
      }
    }

    setShowForm(false);
    setEditingGroup(null);
    setFormData({
      title: '',
      type: 'list',
      icon: '',
      color: '#6366f1',
      start_time: getRoundedTime(0),
      end_time: getRoundedTime(60),
      recurrence_type: 'weekly',
      recurrence_days: [],
      schedules: [],
      show_on_dashboard: true,
    });
    
    // Go back to groups list
    router.push('/groups');
  }, [client, router, addGroup, updateGroup]);

  const deleteGroup = async (groupId: number) => {
    if (!confirm('Excluir este grupo? As tarefas associadas voltarão para a Caixa de Entrada.')) return;
    // OPTIMISTIC: remove do estado local antes da rede.
    deleteGroupFromState(groupId);
    // As tarefas do grupo voltam para a Caixa de Entrada (feito no servidor).
    const res = await grupoAPI.remove(groupId);
    if (!res.success) {
      console.error('Erro ao excluir grupo:', res.error);
      refreshGroups();
      return;
    }
    window.dispatchEvent(new CustomEvent('tasks-updated'));
  };

  const toggleGroupVisibility = async (group: any) => {
    const next = !group.show_on_dashboard;
    // OPTIMISTIC: atualiza estado local antes da rede.
    updateGroup(group.id, { show_on_dashboard: next });
    const res = await grupoAPI.update(group.id, { show_on_dashboard: next });
    if (!res.success) {
      console.error('Erro ao alterar visibilidade:', res.error);
      updateGroup(group.id, { show_on_dashboard: group.show_on_dashboard });
    }
  };

  const editGroup = (group: any) => {
    setEditingGroup(group);
    setFormData({
      title: group.title,
      type: group.type,
      icon: group.icon || '',
      color: group.color || '#6366f1',
      start_time: group.start_time || getRoundedTime(0),
      end_time: group.end_time || getRoundedTime(60),
      recurrence_type: group.recurrence_type || 'weekly',
      recurrence_days: group.recurrence_days || [],
      schedules: parseSchedules(group),
      show_on_dashboard: group.show_on_dashboard !== false,
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
      start_time: getRoundedTime(0),
      end_time: getRoundedTime(60),
      recurrence_type: 'weekly',
      recurrence_days: [],
      schedules: [],
      show_on_dashboard: true,
    });
  };

  const toggleDay = (day: number) => {
    setFormData({
      ...formData,
      recurrence_days: formData.recurrence_days.includes(day)
        ? formData.recurrence_days.filter(d => d !== day)
        : [...formData.recurrence_days, day],
      // No modo "por dia", o botão precisa mexer na lista de horários —
      // senão ele mentiria sobre quais dias estão realmente ativos.
      schedules: formData.schedules.length === 0
        ? formData.schedules
        : formData.schedules.some(sc => sc.day === day)
          ? formData.schedules.filter(sc => sc.day !== day)
          : [...formData.schedules, {
              day,
              start: formData.start_time.slice(0, 5),
              end: formData.end_time.slice(0, 5),
            }],
    });
  };

  if (!user) {
    return <PageShell><PageSkeleton /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        icon={Clock}
        title="Blocos de tempo e listas"
        subtitle="Bloco de tempo tem hora marcada e some da vista até a hora chegar. Lista é uma gaveta sem hora."
        actions={
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="h-8 gap-1.5 text-[13px]">
            <Plus className="w-4 h-4" /> Novo grupo
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {loading ? (
          <div className="col-span-2"><PageSkeleton rows={3} /></div>
        ) : groups.length === 0 ? (
          <div className="col-span-2 rounded-xl border border-border bg-card">
            <EmptyState
              icon={Clock}
              title="Nenhum grupo criado."
              hint="Crie um bloco de tempo (“hora do almoço”) ou uma lista para guardar tarefas."
              action={
                <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="h-8 gap-1.5 text-[13px]">
                  <Plus className="w-4 h-4" /> Criar o primeiro
                </Button>
              }
            />
          </div>
        ) : (
          groups.map((group) => (
            <Card
              key={group.id}
              className={cn(
                "p-4 shadow-card hover:shadow-card-hover transition-shadow overflow-hidden",
                group.color && "soft-card-surface"
              )}
              style={getSoftCardStyle(group.color)}
            >
              <div className="flex items-center gap-3">
                <span style={{ color: group.color ?? undefined }}>
                  <GroupIcon icon={group.icon} fallback={group.type === 'time' ? Clock : List} className="w-6 h-6" />
                </span>
                <div className="flex-1">
                  <h3 className="font-medium" style={group.color ? { color: group.color } : undefined}>{group.title}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {group.type === 'time' ? 'Bloco de Tempo' : 'Lista'}
                    {group.type === 'time' && (
                      <> · {blockDaysLabel(group)}
                        {parseSchedules(group).length > 0
                          ? ' · horário por dia'
                          : group.start_time && group.end_time
                            ? ' · ' + group.start_time.slice(0, 5) + '–' + group.end_time.slice(0, 5)
                            : ''}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => toggleGroupVisibility(group)}
                  className={group.show_on_dashboard ? "text-muted-foreground hover:text-primary" : "text-destructive"}
                  title={group.show_on_dashboard ? "Ocultar do Dashboard" : "Mostrar no Dashboard"}
                >
                  {group.show_on_dashboard ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
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
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Editar' : 'Novo'} grupo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* ── Tipo: dois cartões, sem dropdown ───────────────────── */}
            <div>
              <Label className="mb-1.5 block">O que é isto?</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'time' as const, icon: Clock, title: 'Bloco de tempo', hint: 'Tem hora. Some da vista até chegar.' },
                  { value: 'list' as const, icon: List, title: 'Lista', hint: 'Uma gaveta, sem hora marcada.' },
                ]).map(({ value, icon: Icon, title, hint }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: value })}
                    className={cn(
                      'flex flex-col items-start gap-1 p-2.5 rounded-lg border-2 text-left transition-all',
                      formData.type === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-accent/40'
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon className={cn('w-4 h-4', formData.type === value ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-[13px] font-medium">{title}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Identidade: emoji + nome na mesma linha ────────────── */}
            <div>
              <Label className="mb-1.5 block">Nome</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        type="button"
                        aria-label="Escolher emoji"
                        className="h-10 w-12 shrink-0 p-0 text-xl grid place-items-center"
                        style={formData.color ? { borderColor: formData.color + '66' } : undefined}
                      >
                        {formData.icon || <Smile className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                    }
                  />
                  <PopoverContent align="start" className="w-auto p-2">
                    <div className="grid grid-cols-8 gap-1">
                      {GROUP_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setFormData({ ...formData, icon: emoji })}
                          aria-label={'Usar ' + emoji}
                          className={cn(
                            'w-8 h-8 grid place-items-center rounded-md text-lg transition-colors hover:bg-accent',
                            formData.icon === emoji && 'bg-primary/15 ring-2 ring-primary'
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                      <Input
                        value={formData.icon}
                        onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                        placeholder="ou cole outro"
                        className="h-7 text-[13px]"
                      />
                      {formData.icon && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setFormData({ ...formData, icon: '' })}
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <Input
                  autoFocus
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
                  placeholder={formData.type === 'time' ? 'Ex.: manhã em casa' : 'Ex.: mercado'}
                  className="h-10"
                />
              </div>
            </div>

            {/* ── Cor: uma fileira só, sem grade quebrada ────────────── */}
            <div>
              <Label className="mb-1.5 block">Cor</Label>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    aria-label={'Cor ' + color}
                    className={cn(
                      'w-7 h-7 rounded-full grid place-items-center transition-transform',
                      formData.color === color && 'ring-2 ring-offset-2 ring-primary ring-offset-background scale-110'
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {formData.color === color && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label className="cursor-default">Mostrar no Dashboard</Label>
                <p className="text-[11px] text-muted-foreground">Desligue para virar só uma gaveta na lateral.</p>
              </div>
              <Switch
                checked={formData.show_on_dashboard}
                onCheckedChange={(checked) => setFormData({ ...formData, show_on_dashboard: checked })}
                className="data-[unchecked]:bg-muted-foreground/40"
              />
            </div>

            {formData.type === 'time' && (
              <>
                {/* ── Horário: atalhos + os dois campos ───────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="cursor-default">Horário</Label>
                    <div className="flex gap-1">
                      {TIME_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setFormData({
                            ...formData,
                            start_time: preset.start,
                            end_time: preset.end,
                            schedules: formData.schedules.map(sc => ({ ...sc, start: preset.start, end: preset.end })),
                          })}
                          className="text-[11px] text-muted-foreground hover:text-primary"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="h-10 pl-8 tabular-nums"
                      />
                      <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <span className="text-muted-foreground shrink-0">até</span>
                    <div className="relative flex-1">
                      <Input
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className="h-10 pl-8 tabular-nums"
                      />
                      <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="cursor-default">Dias</Label>
                    <div className="flex gap-1">
                      {DAY_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setFormData({
                            ...formData,
                            recurrence_days: [...preset.days],
                            // No modo "por dia", o atalho remonta a lista mantendo
                            // o horario padrao — senao os dois ficariam brigando.
                            schedules: formData.schedules.length === 0
                              ? formData.schedules
                              : preset.days.map(day => ({
                                  day,
                                  start: formData.schedules.find(sc => sc.day === day)?.start
                                    ?? formData.start_time.slice(0, 5),
                                  end: formData.schedules.find(sc => sc.day === day)?.end
                                    ?? formData.end_time.slice(0, 5),
                                })),
                          })}
                          className="text-[11px] text-muted-foreground hover:text-primary"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {DAY_LABELS.map((day, index) => {
                      const custom = formData.schedules.find(sc => sc.day === index);
                      const active = custom ? true : formData.recurrence_days.includes(index);
                      return (
                        <Button
                          key={day}
                          type="button"
                          variant={active ? 'default' : 'outline'}
                          onClick={() => toggleDay(index)}
                          className={cn(
                            'h-9 w-11 p-0 flex-col gap-0 leading-none',
                            active
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60'
                          )}
                        >
                          <span className="text-[11px]">{day}</span>
                          {custom && (
                            <span className="text-[8px] opacity-80 tabular-nums">
                              {custom.start.slice(0, 5)}
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>

                  {/*
                    Horário diferente em cada dia: "segunda é rodízio, então vai
                    até mais tarde; terça começo mais cedo". Enquanto a lista
                    estiver vazia, vale o horário único definido acima.
                  */}
                  <div className="mt-3 rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-medium">Horário diferente por dia</span>
                      {formData.schedules.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setFormData({ ...formData, schedules: [] })}
                        >
                          Usar horário único
                        </Button>
                      )}
                    </div>

                    {formData.schedules.length === 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const base = formData.recurrence_days.length > 0
                            ? formData.recurrence_days
                            : [1, 2, 3, 4, 5];
                          setFormData({
                            ...formData,
                            schedules: base
                              .slice()
                              .sort((a, b) => a - b)
                              .map(day => ({
                                day,
                                start: formData.start_time.slice(0, 5),
                                end: formData.end_time.slice(0, 5),
                              })),
                          });
                        }}
                      >
                        <Plus className="w-3 h-3" /> Definir por dia
                      </Button>
                    ) : (
                      <div className="space-y-1.5">
                        {formData.schedules
                          .slice()
                          .sort((a, b) => a.day - b.day)
                          .map((sc) => (
                            <div key={sc.day} className="flex items-center gap-1.5">
                              <span className="w-9 text-[12px] text-muted-foreground shrink-0">
                                {DAY_LABELS[sc.day]}
                              </span>
                              <Input
                                type="time"
                                value={sc.start}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  schedules: formData.schedules.map(x =>
                                    x.day === sc.day ? { ...x, start: e.target.value } : x
                                  ),
                                })}
                                className="h-7 text-[12px] flex-1 min-w-0"
                              />
                              <span className="text-muted-foreground text-[12px]">–</span>
                              <Input
                                type="time"
                                value={sc.end}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  schedules: formData.schedules.map(x =>
                                    x.day === sc.day ? { ...x, end: e.target.value } : x
                                  ),
                                })}
                                className="h-7 text-[12px] flex-1 min-w-0"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                aria-label={'Tirar ' + DAY_LABELS[sc.day]}
                                onClick={() => setFormData({
                                  ...formData,
                                  schedules: formData.schedules.filter(x => x.day !== sc.day),
                                })}
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                      </div>
                    )}
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
    </PageShell>
  );
}

export function PaginaGrupos() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Carregando...</div>}>
      <ConteudoGrupos />
    </Suspense>
  );
}
