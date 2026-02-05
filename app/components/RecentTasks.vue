<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { GripVertical, Trash2, Calendar } from 'lucide-vue-next'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Checkbox from '@/components/ui/checkbox/Checkbox.vue'
import Button from '@/components/ui/button/Button.vue'

const client = useSupabaseClient()
const user = useSupabaseUser()
// Receber userId via prop para garantir reatividade vinda do pai
const props = defineProps<{
  userId?: string
  viewGroupId?: number | null
  viewGroupIds?: number[]
  groupColor?: string
  groupTitle?: string
  hideEmpty?: boolean
}>()

const todos = ref<any[]>([])
const loading = ref(false)
const selectedTasks = ref<Set<number>>(new Set())
const lastSelectedIndex = ref<number | null>(null)
const shiftKeyPressed = ref(false)

// Computar o ID efetivo usando prop ou o composable local como fallback
const effectiveUserId = computed(() => props.userId || user.value?.id || (user.value as any)?.sub)

const fetchTasks = async () => {
  const currentUserId = effectiveUserId.value
  console.log('fetchTasks called. User:', currentUserId, 'ViewGroupId:', props.viewGroupId)
  
  if (!currentUserId) {
    console.log('No user for tasks, skipping')
    loading.value = false
    todos.value = []
    return
  }
  
  loading.value = true
  try {
    // Timeout de 5 segundos
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching tasks')), 5000))
    
    let query
    
    console.log('Querying tasks for user:', currentUserId)
    
    // Configurar a query baseada no filtro
    if (props.viewGroupIds && props.viewGroupIds.length > 0) {
      // Filtrar por múltiplos grupos usando Inner Join e IN
      query = client
        .from('todos')
        .select('*, todo_groups!inner(group_id)')
        .eq('user_id', currentUserId)
        .in('todo_groups.group_id', props.viewGroupIds)
        .order('created_at', { ascending: false })
    } else if (props.viewGroupId !== undefined && props.viewGroupId !== null) {
      // Filtrar por grupo específico usando Inner Join
      query = client
        .from('todos')
        .select('*, todo_groups!inner(group_id)')
        .eq('user_id', currentUserId)
        .eq('todo_groups.group_id', props.viewGroupId)
        .order('created_at', { ascending: false })
    } else {
      // Buscar todas (ou Inbox) - Trazendo os grupos para filtragem ou display
      query = client
        .from('todos')
        .select('*, todo_groups(group_id)')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
    }

    // @ts-ignore
    const { data, error } = await Promise.race([query, timeoutPromise])
      
    if (error) throw error
    
    let fetchedTodos = data || []
    
    // Filtragem Client-side para "Inbox" (sem grupos)
    if (props.viewGroupId === null) {
      fetchedTodos = fetchedTodos.filter((t: any) => !t.todo_groups || t.todo_groups.length === 0)
    }
    
    todos.value = fetchedTodos
    
    // Clear selection if tasks changed significantly
    const currentIds = new Set(todos.value.map(t => t.id))
    selectedTasks.value = new Set([...selectedTasks.value].filter(id => currentIds.has(id)))
    
  } catch (e) {
    console.error('Error fetching tasks:', e)
    todos.value = []
  } finally {
    loading.value = false
  }
}

const onDragStart = (event: DragEvent, todo: any) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', todo.id.toString())
    event.dataTransfer.effectAllowed = 'move'
    // Optional: Set a custom drag image or style
  }
}

const handleCheckboxClick = (event: MouseEvent) => {
  shiftKeyPressed.value = event.shiftKey
}

const handleCheckboxUpdate = (id: number, checked: boolean, index: number) => {
  if (shiftKeyPressed.value && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index)
    const end = Math.max(lastSelectedIndex.value, index)
    
    // Aplicar o estado 'checked' a todas no intervalo
    for (let i = start; i <= end; i++) {
      const taskId = todos.value[i].id
      if (checked) {
        selectedTasks.value.add(taskId)
      } else {
        selectedTasks.value.delete(taskId)
      }
    }
  } else {
    // Comportamento normal
    if (checked) {
      selectedTasks.value.add(id)
    } else {
      selectedTasks.value.delete(id)
    }
  }
  
  // Sempre atualiza o último índice clicado
  lastSelectedIndex.value = index
  // Resetar flag
  shiftKeyPressed.value = false
}

const toggleAll = (checked: boolean) => {
  if (checked) {
    todos.value.forEach(t => selectedTasks.value.add(t.id))
  } else {
    selectedTasks.value.clear()
  }
  lastSelectedIndex.value = null
}

const deleteSelected = async () => {
  if (!selectedTasks.value.size) return
  if (!confirm(`Tem certeza que deseja excluir ${selectedTasks.value.size} tarefas?`)) return
  
  try {
    const { error } = await client
      .from('todos')
      .delete()
      .in('id', Array.from(selectedTasks.value))
      
    if (error) throw error
    
    selectedTasks.value.clear()
    lastSelectedIndex.value = null
    fetchTasks()
  } catch (e) {
    console.error('Error deleting tasks:', e)
  }
}

const handleBlur = async (todo: any) => {
  if (todo.title.trim() === '') return
  
  try {
    await client
      .from('todos')
      .update({ title: todo.title })
      .eq('id', todo.id)
  } catch (e) {
    console.error('Error updating task:', e)
  }
}

const updateDueDate = async (todo: any, event: Event) => {
  const input = event.target as HTMLInputElement
  const newDate = input.value ? new Date(input.value).toISOString() : null
  
  todo.due_at = newDate
  
  try {
    await client
      .from('todos')
      .update({ due_at: newDate })
      .eq('id', todo.id)
  } catch (e) {
    console.error('Error updating task date:', e)
  }
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return ''
  return format(new Date(dateString), "dd/MM HH:mm", { locale: ptBR })
}

// Watch para userId com immediate para pegar o valor inicial
watch(effectiveUserId, (newId) => {
  fetchTasks()
}, { immediate: true })

// Watch for viewGroupId changes
watch(() => props.viewGroupId, () => {
  fetchTasks()
})

// Watch for viewGroupIds changes
watch(() => props.viewGroupIds, () => {
  fetchTasks()
}, { deep: true })

onMounted(() => {
  // Listen for global task updates (e.g. dropped in sidebar)
  window.addEventListener('task-updated', fetchTasks)
})

onUnmounted(() => {
  window.removeEventListener('task-updated', fetchTasks)
})

// Expose refresh to parent
defineExpose({ refresh: fetchTasks })
</script>

<template>
  <div class="mt-8 transition-all" :class="{ 'hidden': hideEmpty && todos.length === 0 }">
    <div 
      class="flex items-center justify-between mb-4 h-10 px-3 py-2 rounded-md transition-colors"
      :style="groupColor ? { backgroundColor: `${groupColor}20`, borderLeft: `4px solid ${groupColor}` } : {}"
    >
      <div class="flex items-center gap-3">
         <Checkbox 
           :checked="todos.length > 0 && selectedTasks.size === todos.length"
           @update:checked="toggleAll"
           v-if="todos.length > 0"
         />
         <h3 class="text-sm font-medium" :class="groupColor ? 'text-foreground' : 'text-muted-foreground'">
           {{ groupTitle || (viewGroupIds?.length ? 'Tarefas Filtradas' : (viewGroupId !== undefined ? (viewGroupId === null ? 'Tarefas sem grupo' : 'Tarefas do Grupo') : 'Todas as tarefas')) }}
         </h3>
      </div>

      <Button 
        v-if="selectedTasks.size > 0" 
        variant="destructive" 
        size="sm" 
        @click="deleteSelected"
        class="animate-in fade-in slide-in-from-right-5"
      >
        <Trash2 class="w-4 h-4 mr-2" />
        Apagar ({{ selectedTasks.size }})
      </Button>
    </div>
    
    <div class="space-y-2 pl-2">
      <div v-if="loading && todos.length === 0" class="text-sm text-muted-foreground animate-pulse">
        Carregando...
      </div>
      
      <div v-else-if="todos.length === 0" class="text-sm text-muted-foreground italic pl-2">
        Nenhuma tarefa encontrada.
      </div>
      
      <div 
        v-else
        v-for="(todo, index) in todos" 
        :key="todo.id" 
        class="flex items-center gap-3 p-3 rounded-lg border bg-card text-card-foreground shadow-sm animate-in fade-in slide-in-from-top-2 group cursor-move hover:border-primary/50 transition-colors"
        :class="{ 'border-primary bg-primary/5': selectedTasks.has(todo.id) }"
        draggable="true"
        @dragstart="onDragStart($event, todo)"
      >
        <GripVertical class="w-4 h-4 text-muted-foreground opacity-20 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
        
        <Checkbox 
          :checked="selectedTasks.has(todo.id)"
          @click="handleCheckboxClick"
          @update:checked="(val) => handleCheckboxUpdate(todo.id, val, index)"
        />

        <div class="flex-1 min-w-0 flex items-center gap-2 group/item">
          <input 
            v-model="todo.title" 
            @blur="handleBlur(todo)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            class="w-full bg-transparent border-none p-0 text-sm focus:ring-0"
            :class="{ 'line-through text-muted-foreground': todo.is_completed }"
          />
          
          <div class="relative flex items-center">
            <input 
              type="datetime-local"
              :value="todo.due_at ? new Date(todo.due_at).toISOString().slice(0, 16) : ''"
              @change="updateDueDate(todo, $event)"
              class="absolute inset-0 opacity-0 cursor-pointer w-8"
            />
            <div 
              class="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-muted transition-colors whitespace-nowrap"
              :class="todo.due_at ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover/item:opacity-100'"
            >
              <Calendar class="w-3 h-3" />
              <span v-if="todo.due_at">{{ formatDate(todo.due_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
