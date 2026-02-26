<template>
  <div class="p-4 md:p-6 w-full pb-24 md:pb-6">
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">{{ pageTitle }}</h1>
        <p class="text-muted-foreground">Gerencie seus grupos de tarefas baseados em horários.</p>
      </div>
      <Button variant="outline" @click="$router.push('/')">Voltar</Button>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- Form to create/edit group -->
      <Card>
        <CardHeader>
          <CardTitle>{{ isEditing ? 'Editar Grupo' : 'Novo Grupo' }}</CardTitle>
          <CardDescription>{{ isEditing ? 'Edite as informações do grupo.' : 'Crie um novo grupo de visualização.' }}</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="saveGroup" class="space-y-4">
            <div class="space-y-2" v-if="!typeFilter">
              <Label>Tipo de Grupo</Label>
              <div class="flex gap-4 p-1">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" v-model="formGroup.type" value="time" class="accent-primary w-4 h-4" />
                  <span class="text-sm">Bloco de Tempo</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" v-model="formGroup.type" value="list" class="accent-primary w-4 h-4" />
                  <span class="text-sm">Lista</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" v-model="formGroup.type" value="category" class="accent-primary w-4 h-4" />
                  <span class="text-sm">Categoria</span>
                </label>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="title">Nome do Grupo</Label>
              <Input id="title" v-model="formGroup.title" placeholder="Ex: Manhã Trabalho" required />
            </div>
            
            <div v-if="formGroup.type === 'time'" class="space-y-4">
              <div v-for="(schedule, index) in formGroup.schedules" :key="index" class="border p-4 rounded-lg bg-muted/20 relative animate-in fade-in slide-in-from-top-2">
                <button 
                  v-if="formGroup.schedules.length > 1"
                  type="button" 
                  class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                  @click="removeSchedule(index)"
                  title="Remover horário"
                >
                  <Trash2 class="w-4 h-4" />
                </button>

                <div class="grid grid-cols-2 gap-4 mb-4">
                  <div class="space-y-2">
                    <Label :for="'start_time_' + index">Início</Label>
                    <Input :id="'start_time_' + index" type="time" v-model="schedule.start_time" required />
                  </div>
                  <div class="space-y-2">
                    <Label :for="'end_time_' + index">Fim</Label>
                    <Input :id="'end_time_' + index" type="time" v-model="schedule.end_time" required />
                  </div>
                </div>

                <div class="space-y-2">
                  <Label>Recorrência</Label>
                  <div class="flex gap-4 p-1 flex-wrap">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="schedule.recurrence_type" value="daily" class="accent-primary w-4 h-4" />
                      <span class="text-sm">Diário (Todo dia)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="schedule.recurrence_type" value="weekly" class="accent-primary w-4 h-4" />
                      <span class="text-sm">Semanal</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="schedule.recurrence_type" value="monthly" class="accent-primary w-4 h-4" />
                      <span class="text-sm">Mensal</span>
                    </label>
                  </div>
                </div>

                <!-- Weekly Selector -->
                <div v-if="schedule.recurrence_type === 'weekly'" class="space-y-2 mt-4 animate-in fade-in slide-in-from-top-2">
                  <Label>Dias da Semana</Label>
                  <div class="flex flex-wrap gap-2">
                    <button 
                      v-for="day in weekDays" 
                      :key="day.value"
                      type="button"
                      class="w-8 h-8 rounded-full border text-xs font-medium transition-colors"
                      :class="schedule.recurrence_days.includes(day.value) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'"
                      @click="toggleWeekDay(index, day.value)"
                      :title="day.name"
                    >
                      {{ day.label }}
                    </button>
                  </div>
                  <p class="text-xs text-muted-foreground" v-if="schedule.recurrence_days.length === 0">Selecione pelo menos um dia.</p>
                </div>

                <!-- Monthly Selector -->
                <div v-if="schedule.recurrence_type === 'monthly'" class="space-y-2 mt-4 animate-in fade-in slide-in-from-top-2">
                  <Label>Dias do Mês</Label>
                  <div class="grid grid-cols-7 gap-1 sm:gap-2">
                    <button 
                      v-for="day in 31" 
                      :key="day"
                      type="button"
                      class="w-8 h-8 rounded-md border text-xs font-medium transition-colors"
                      :class="schedule.recurrence_days.includes(day) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'"
                      @click="toggleMonthDay(index, day)"
                    >
                      {{ day }}
                    </button>
                  </div>
                  <p class="text-xs text-muted-foreground" v-if="schedule.recurrence_days.length === 0">Selecione pelo menos um dia.</p>
                </div>
              </div>

              <Button type="button" variant="outline" class="w-full" @click="addSchedule">
                <Plus class="w-4 h-4 mr-2" />
                Adicionar Horário
              </Button>
            </div>

            <div class="space-y-2">
              <Label>Cor</Label>
              <div class="flex flex-wrap gap-2">
                <button 
                  v-for="color in presetColors" 
                  :key="color.value"
                  type="button"
                  class="w-6 h-6 rounded-full border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  :class="[
                    formGroup.color === color.value ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                  ]"
                  :style="{ backgroundColor: color.value }"
                  @click="formGroup.color = color.value"
                  :title="color.name"
                ></button>
              </div>
            </div>

            <div class="space-y-2">
              <Label>Ícone</Label>
              <div class="flex flex-wrap gap-2">
                <button 
                  v-for="icon in presetIcons" 
                  :key="icon.name"
                  type="button"
                  class="w-8 h-8 flex items-center justify-center rounded-md border hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                  :class="[
                    formGroup.icon === icon.name ? 'bg-primary text-primary-foreground hover:bg-primary' : ''
                  ]"
                  @click="formGroup.icon = icon.name"
                  :title="icon.name"
                >
                  <component :is="icon.component" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="flex gap-2">
              <Button type="submit" class="flex-1" :disabled="loading">
                {{ loading ? 'Salvando...' : (isEditing ? 'Atualizar Grupo' : 'Criar Grupo') }}
              </Button>
              <Button v-if="isEditing" type="button" variant="outline" @click="cancelEdit">
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <!-- List of existing groups -->
      <Card>
        <CardHeader>
          <CardTitle>Seus Grupos</CardTitle>
          <CardDescription>Grupos ativos ordenados por horário.</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="loadingGroups" class="text-center py-4 text-muted-foreground">
            Carregando...
          </div>
          <div v-else-if="groups.length === 0" class="text-center py-4 text-muted-foreground">
            Nenhum grupo criado.
          </div>
          <div v-else class="space-y-4">
            <div 
              v-for="group in filteredGroups" 
              :key="group.id" 
              class="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              :class="{ 'border-primary ring-1 ring-primary': isEditing && editingId === group.id }"
              @click="startEdit(group)"
            >
              <div class="flex items-center gap-3">
                <div 
                  class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs"
                  :style="{ backgroundColor: group.color || '#6366f1' }"
                >
                  <component 
                    :is="getIconComponent(group.icon)" 
                    class="w-4 h-4" 
                  />
                </div>
                <div>
                  <h3 class="font-medium">{{ group.title }}</h3>
                  <p class="text-sm text-muted-foreground">
                    {{ formatTime(group.start_time) }} - {{ formatTime(group.end_time) }}
                    <span v-if="group.type === 'time'" class="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">
                      {{ getRecurrenceLabel(group) }}
                    </span>
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                @click.stop="openDeleteModal(group.id)" 
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                Excluir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeDeleteModal">
      <Card class="w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
        <CardHeader>
          <CardTitle>Confirmar Exclusão</CardTitle>
          <CardDescription>Tem certeza que deseja excluir este grupo? Esta ação não pode ser desfeita.</CardDescription>
        </CardHeader>
        <CardFooter class="flex justify-end gap-2">
          <Button variant="outline" @click="closeDeleteModal">Cancelar (Esc)</Button>
          <Button variant="destructive" @click="executeDeleteGroup">Excluir (Enter)</Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import Button from '@/components/ui/button/Button.vue'
import Card from '@/components/ui/card/Card.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import CardFooter from '@/components/ui/card/CardFooter.vue'
import Input from '@/components/ui/input/Input.vue'
import Label from '@/components/ui/label/Label.vue'
import { 
  Briefcase, Home, Coffee, Sun, Moon, Star, Heart, Book, Laptop, Smartphone, ShoppingCart, Zap,
  Folder, Calendar, Clock, CheckCircle
} from 'lucide-vue-next'

import { Plus, X, Trash2 } from 'lucide-vue-next'

const client = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

const loading = ref(false)
const loadingGroups = ref(false)
const groups = ref<any[]>([])
const isEditing = ref(false)
const editingId = ref<number | null>(null)
const showDeleteModal = ref(false)
const groupToDeleteId = ref<number | null>(null)

const typeFilter = computed(() => route.query.type as string | undefined)

const filteredGroups = computed(() => {
  if (!typeFilter.value) return groups.value
  return groups.value.filter(g => g.type === typeFilter.value)
})

const pageTitle = computed(() => {
  const type = typeFilter.value
  if (type === 'time') return 'Gerenciar Blocos de Tempo'
  if (type === 'list') return 'Gerenciar Listas'
  if (type === 'category') return 'Gerenciar Categorias'
  return 'Grupos de Visualização'
})

interface Schedule {
  start_time: string
  end_time: string
  recurrence_type: string
  recurrence_days: number[]
}

const formGroup = ref({
  title: '',
  color: '#6366f1',
  icon: 'Folder',
  type: 'time',
  schedules: [] as Schedule[]
})

// Initialize with one empty schedule
const addSchedule = () => {
  formGroup.value.schedules.push({
    start_time: '',
    end_time: '',
    recurrence_type: 'daily',
    recurrence_days: []
  })
}

const removeSchedule = (index: number) => {
  formGroup.value.schedules.splice(index, 1)
}

const weekDays = [
  { label: 'D', value: 0, name: 'Domingo' },
  { label: 'S', value: 1, name: 'Segunda' },
  { label: 'T', value: 2, name: 'Terça' },
  { label: 'Q', value: 3, name: 'Quarta' },
  { label: 'Q', value: 4, name: 'Quinta' },
  { label: 'S', value: 5, name: 'Sexta' },
  { label: 'S', value: 6, name: 'Sábado' },
]

const toggleWeekDay = (scheduleIndex: number, day: number) => {
  const schedule = formGroup.value.schedules[scheduleIndex]
  const index = schedule.recurrence_days.indexOf(day)
  if (index === -1) {
    schedule.recurrence_days.push(day)
  } else {
    schedule.recurrence_days.splice(index, 1)
  }
  schedule.recurrence_days.sort((a, b) => a - b)
}

const toggleMonthDay = (scheduleIndex: number, day: number) => {
  const schedule = formGroup.value.schedules[scheduleIndex]
  const index = schedule.recurrence_days.indexOf(day)
  if (index === -1) {
    schedule.recurrence_days.push(day)
  } else {
    schedule.recurrence_days.splice(index, 1)
  }
  schedule.recurrence_days.sort((a, b) => a - b)
}

const presetColors = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Slate', value: '#64748b' },
]

const presetIcons = [
  { name: 'Folder', component: Folder },
  { name: 'Briefcase', component: Briefcase },
  { name: 'Home', component: Home },
  { name: 'Coffee', component: Coffee },
  { name: 'Sun', component: Sun },
  { name: 'Moon', component: Moon },
  { name: 'Star', component: Star },
  { name: 'Heart', component: Heart },
  { name: 'Book', component: Book },
  { name: 'Laptop', component: Laptop },
  { name: 'Smartphone', component: Smartphone },
  { name: 'ShoppingCart', component: ShoppingCart },
  { name: 'Zap', component: Zap },
  { name: 'Calendar', component: Calendar },
  { name: 'Clock', component: Clock },
  { name: 'CheckCircle', component: CheckCircle },
]

const getIconComponent = (iconName: string) => {
  const icon = presetIcons.find(i => i.name === iconName)
  return icon ? icon.component : Folder
}

const fetchGroups = async () => {
  loadingGroups.value = true
  try {
    const { data, error } = await client
      .from('view_groups')
      .select('*')
      .order('start_time')
    
    if (error) throw error
    groups.value = data || []
  } catch (e) {
    console.error('Error fetching groups:', e)
  } finally {
    loadingGroups.value = false
  }
}

const startEdit = (group: any) => {
  isEditing.value = true
  editingId.value = group.id
  
  // Parse existing schedules or create from legacy fields
  let schedules: Schedule[] = []
  
  if (group.schedules && Array.isArray(group.schedules) && group.schedules.length > 0) {
    schedules = JSON.parse(JSON.stringify(group.schedules))
  } else if (group.start_time && group.end_time) {
    // Backward compatibility
    schedules = [{
      start_time: group.start_time.substring(0, 5),
      end_time: group.end_time.substring(0, 5),
      recurrence_type: group.recurrence_type || 'daily',
      recurrence_days: group.recurrence_days || []
    }]
  } else {
    // Default empty schedule for new time groups
    schedules = [{
      start_time: '',
      end_time: '',
      recurrence_type: 'daily',
      recurrence_days: []
    }]
  }

  formGroup.value = {
    title: group.title,
    color: group.color || '#6366f1',
    icon: group.icon || 'Folder',
    type: group.type || 'time',
    schedules: schedules
  }
}

const cancelEdit = () => {
  isEditing.value = false
  editingId.value = null
  formGroup.value = {
    title: '',
    color: '#6366f1',
    icon: 'Folder',
    type: route.query.type ? (route.query.type as string) : 'time',
    schedules: [{
      start_time: '',
      end_time: '',
      recurrence_type: 'daily',
      recurrence_days: []
    }]
  }
}

const saveGroup = async () => {
  if (!user.value) return
  
  // Validation: filter out incomplete schedules
  const validSchedules = formGroup.value.schedules.filter(s => s.start_time && s.end_time)
  
  if (formGroup.value.type === 'time' && validSchedules.length === 0) {
    alert('Adicione pelo menos um horário válido.')
    return
  }

  loading.value = true
  try {
    // Prepare payload
    // We update both the new 'schedules' column AND the legacy columns
    // The legacy columns will take the FIRST schedule's data as a fallback/primary display
    const primarySchedule = validSchedules.length > 0 ? validSchedules[0] : null

    const payload = {
      title: formGroup.value.title,
      color: formGroup.value.color,
      icon: formGroup.value.icon,
      type: formGroup.value.type,
      // New column
      schedules: formGroup.value.type === 'time' ? validSchedules : null,
      // Legacy columns (mapped from first schedule)
      start_time: primarySchedule ? primarySchedule.start_time : null,
      end_time: primarySchedule ? primarySchedule.end_time : null,
      recurrence_type: primarySchedule ? primarySchedule.recurrence_type : null,
      recurrence_days: primarySchedule && primarySchedule.recurrence_type !== 'daily' ? primarySchedule.recurrence_days : null
    }

    if (isEditing.value && editingId.value) {
      // Update existing group
      const { error } = await client
        .from('view_groups')
        .update(payload)
        .eq('id', editingId.value)

      if (error) throw error
    } else {
      // Create new group
      const { error } = await client
        .from('view_groups')
        .insert({
          ...payload,
          user_id: user.value.id
        })

      if (error) throw error
    }
    
    // Reset form and refresh list
    cancelEdit()
    await fetchGroups()
  } catch (e) {
    console.error('Error saving group:', e)
    alert('Erro ao salvar grupo.')
  } finally {
    loading.value = false
  }
}

const openDeleteModal = (id: number) => {
  groupToDeleteId.value = id
  showDeleteModal.value = true
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  groupToDeleteId.value = null
}

const executeDeleteGroup = async () => {
  if (!groupToDeleteId.value) return
  const id = groupToDeleteId.value
  
  try {
    // First, unlink any todos associated with this group
    const { error: unlinkError } = await client
      .from('todos')
      .update({ view_group_id: null })
      .eq('view_group_id', id)

    if (unlinkError) {
      console.error('Error unlinking todos:', unlinkError)
      // Continue anyway to try deleting from todo_groups
    }

    // Remove from join table if exists
    const { error: joinError } = await client
      .from('todo_groups')
      .delete()
      .eq('group_id', id)

    if (joinError) {
       console.error('Error deleting from todo_groups:', joinError)
    }

    // Finally delete the group
    const { error } = await client
      .from('view_groups')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    if (editingId.value === id) {
      cancelEdit()
    }
    await fetchGroups()
    closeDeleteModal()
  } catch (e: any) {
    console.error('Error deleting group:', e)
    alert(`Erro ao excluir grupo: ${e.message || 'Erro desconhecido'}`)
  }
}

const formatTime = (time: string | null | undefined) => {
  if (!time) return '--:--'
  // Simple format, assuming HH:MM:SS or HH:MM
  return time.substring(0, 5)
}

const getRecurrenceLabel = (group: any) => {
  if (group.recurrence_type === 'weekly') {
    if (!group.recurrence_days || group.recurrence_days.length === 0) return 'Semanal'
    const weekMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    return `Semanal: ${group.recurrence_days.map((d: number) => weekMap[d]).join(', ')}`
  }
  if (group.recurrence_type === 'monthly') {
     if (!group.recurrence_days || group.recurrence_days.length === 0) return 'Mensal'
     return `Mensal: Dias ${group.recurrence_days.join(', ')}`
  }
  return 'Diário'
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!showDeleteModal.value) return
  
  if (e.key === 'Escape') {
    closeDeleteModal()
  } else if (e.key === 'Enter') {
    executeDeleteGroup()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (user.value) fetchGroups()
  
  // Set initial type from query
  if (route.query.type) {
    formGroup.value.type = route.query.type as string
  }
  
  // Check for create action
  if (route.query.action === 'create') {
    cancelEdit() // Reset form (already sets type if query.type is present because of logic above? wait, cancelEdit resets to default)
    // Re-apply type after cancelEdit
    if (route.query.type) {
        formGroup.value.type = route.query.type as string
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(user, (u) => {
  if (u) fetchGroups()
}, { immediate: true })

watch(() => route.query.type, (newType) => {
  if (newType) {
    formGroup.value.type = newType as string
    // If we are editing a group of a different type, maybe cancel edit?
    // Or if we are in 'create' mode (not editing), just update the type.
    if (!isEditing.value) {
       // update form type
    } else {
       // if editing and user changes filter, we might want to cancel edit if the edited group is not of the new type
       const editingGroup = groups.value.find(g => g.id === editingId.value)
       if (editingGroup && editingGroup.type !== newType) {
         cancelEdit()
         formGroup.value.type = newType as string
       }
    }
  }
})
</script>
