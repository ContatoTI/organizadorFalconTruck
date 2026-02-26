<script setup lang="ts">
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { ref, onMounted } from 'vue'
import type { Database } from '~/types/database.types'

const client = useSupabaseClient<Database>()
const user = useSupabaseUser()

const events = ref<any[]>([])

// Mapeamento de dias da semana
const dayMap: Record<string, number> = {
  'domingo': 0,
  'segunda': 1,
  'terça': 2,
  'quarta': 3,
  'quinta': 4,
  'sexta': 5,
  'sábado': 6,
  'sabado': 6 // Sem acento por garantia
}

// Opções do calendário
const calendarOptions = ref({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay'
  },
  locale: 'pt-br',
  slotMinTime: '06:00:00', // Começa as 6 da manhã para focar no dia útil
  slotMaxTime: '23:00:00',
  allDaySlot: true,
  editable: false, // Por enquanto apenas visualização
  selectable: true,
  events: events,
  eventTimeFormat: { // formatação de hora
    hour: '2-digit',
    minute: '2-digit',
    meridiem: false
  }
})

// Buscar tarefas
const fetchTodos = async () => {
  if (!user.value) return []
  
  const { data, error } = await client
    .from('todos')
    .select('*')
    .eq('user_id', user.value.id)
    .not('due_at', 'is', null)

  if (error) {
    console.error('Erro ao buscar tarefas:', error)
    return []
  }

  return data.map(todo => ({
    id: `todo-${todo.id}`,
    title: `Task: ${todo.title}`,
    start: todo.due_at,
    color: '#3b82f6', // Azul para tarefas
    textColor: '#ffffff',
    borderColor: '#2563eb',
    extendedProps: {
      type: 'todo',
      completed: todo.is_completed
    },
    classNames: [todo.is_completed ? 'line-through opacity-70' : '']
  }))
}

// Buscar grupos de visualização (Blocos de Tempo)
const fetchViewGroups = async () => {
  if (!user.value) return []

  const { data, error } = await client
    .from('view_groups')
    .select('*')
    .eq('user_id', user.value.id)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null)

  if (error) {
    console.error('Erro ao buscar grupos:', error)
    return []
  }

  return data.flatMap(group => {
    const schedules = (group.schedules && Array.isArray(group.schedules) && group.schedules.length > 0) 
      ? group.schedules 
      : [{
          start_time: group.start_time,
          end_time: group.end_time,
          recurrence_days: group.recurrence_days
        }]

    return schedules.map((schedule: any, index: number) => {
      let daysOfWeek: number[] | undefined = schedule.recurrence_days || group.recurrence_days || undefined

      // Se não tiver dias definidos no banco, tentar inferir pelo título (apenas se for o schedule padrão/root)
      if (!daysOfWeek || daysOfWeek.length === 0) {
        const titleLower = group.title.toLowerCase()
        const foundDays: number[] = []
        Object.entries(dayMap).forEach(([dayName, dayIndex]) => {
          if (titleLower.includes(dayName)) {
            foundDays.push(dayIndex)
          }
        })
        if (foundDays.length > 0) {
          daysOfWeek = foundDays
        }
      }

      // Se ainda não tiver dias, assumir todos os dias
      if (!daysOfWeek || daysOfWeek.length === 0) {
        daysOfWeek = [0, 1, 2, 3, 4, 5, 6]
      }

      return {
        id: `group-${group.id}-${index}`,
        title: group.title,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        daysOfWeek: daysOfWeek, 
        display: 'background', // Mostra como fundo
        backgroundColor: group.color || '#e5e7eb', // Cor padrão cinza claro se n tiver
        borderColor: 'transparent',
        extendedProps: {
          type: 'group',
          groupId: group.id
        }
      }
    })
  })
}

const loadData = async () => {
  const [todos, groups] = await Promise.all([fetchTodos(), fetchViewGroups()])
  events.value = [...groups, ...todos]
}

onMounted(() => {
  const isMobile = window.innerWidth < 768
  calendarOptions.value.initialView = isMobile ? 'timeGridDay' : 'timeGridWeek'
  calendarOptions.value.headerToolbar = isMobile 
    ? { left: 'prev,next', center: 'title', right: 'timeGridDay,listWeek' }
    : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }
  
  loadData()
})
</script>

<template>
  <div class="p-4 md:p-6 h-full flex flex-col pb-24 md:pb-6">
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 md:mb-6 gap-4">
      <h1 class="text-2xl md:text-3xl font-bold">Calendário</h1>
      <div class="flex gap-2 text-xs md:text-sm text-gray-500">
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>Tarefas</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded bg-gray-200 border border-gray-300"></div>
          <span>Blocos de Tempo</span>
        </div>
      </div>
    </div>
    
    <div class="bg-white p-2 md:p-4 rounded-lg shadow border flex-1 min-h-[500px] md:min-h-0 overflow-hidden">
      <FullCalendar :options="calendarOptions" class="h-full w-full text-xs md:text-sm" />
    </div>
  </div>
</template>

<style>
/* Customização leve do FullCalendar para combinar com shadcn/ui */
.fc {
  font-family: inherit;
}
.fc-toolbar-title {
  font-size: 1.25rem !important;
  font-weight: 600;
}
.fc-button {
  @apply bg-primary text-primary-foreground hover:bg-primary/90 font-medium !important;
  border: none !important;
  text-transform: capitalize;
}
.fc-button-active {
  @apply bg-primary/80 !important;
}
.fc-event-main {
  padding: 2px 4px;
}
</style>
