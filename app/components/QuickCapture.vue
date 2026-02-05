<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import Input from '@/components/ui/input/Input.vue'
import { CornerDownLeft } from 'lucide-vue-next'

const client = useSupabaseClient<any>()
const user = useSupabaseUser()
const emit = defineEmits(['task-added'])

const props = defineProps<{
  groups?: any[]
  currentGroupId?: number | null
}>()

const newTask = ref('')
const isSaving = ref(false)
const selectedGroupId = ref<number | null>(null)

const canSave = computed(() => {
  const hasId = !!(user.value?.id || (user.value as any)?.sub)
  return hasId
})

// Update selection when currentGroupId changes (and on mount)
watch(() => props.currentGroupId, (newVal) => {
  if (newVal !== undefined) {
    selectedGroupId.value = newVal
  }
}, { immediate: true })

// Focus on mount
onMounted(() => {
  setTimeout(() => {
    const el = document.querySelector('input[name="quick-capture"]') as HTMLInputElement
    if (el && canSave.value) el.focus()
  }, 100)
})

const handleKeydown = async (e: KeyboardEvent) => {
  if (e.key === 'Enter' && newTask.value.trim()) {
    e.preventDefault()
    await saveTask()
  }
}

const saveTask = async () => {
  if (!newTask.value.trim() || isSaving.value) return

  if (!canSave.value) {
    alert('Você precisa estar logado para salvar tarefas!')
    return
  }

  const title = newTask.value
  isSaving.value = true
  
  // Optimistic update: clear immediately
  newTask.value = ''

  try {
    const userId = user.value?.id || (user.value as any)?.sub
    
    // 1. Insert Task
    const { data: taskData, error: taskError } = await client
      .from('todos')
      .insert({
        title: title,
        user_id: userId,
        is_completed: false
      })
      .select()
      .single()

    if (taskError) throw taskError
    
    // 2. Associate with Group if selected
    if (selectedGroupId.value && taskData) {
      const { error: groupError } = await client
        .from('todo_groups')
        .insert({
          todo_id: taskData.id,
          group_id: selectedGroupId.value,
          user_id: userId
        })
      
      if (groupError) {
        console.error('Error associating group:', groupError)
        // We don't block the task creation, just log error
      }
    }
    
    // Emit event to refresh lists if needed
    emit('task-added') 
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro desconhecido'
    console.error('Error saving task:', e)
    // Restore text on error (simple handling)
    newTask.value = title
    alert('Erro ao salvar tarefa: ' + message)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-2xl mx-auto mb-8">
    <div class="flex gap-2">
      <!-- Group Selector -->
      <select
        v-if="canSave && groups && groups.length > 0"
        v-model="selectedGroupId"
        class="h-14 w-32 rounded-md border-2 border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-colors cursor-pointer"
        title="Selecionar Grupo"
      >
        <option :value="null">Geral</option>
        <option v-for="group in groups" :key="group.id" :value="group.id">
          {{ group.title }}
        </option>
      </select>

      <div class="relative flex-1">
        <Input
          name="quick-capture"
          v-model="newTask"
          @keydown="handleKeydown"
          :placeholder="canSave ? 'O que precisa ser feito?' : 'Faça login para adicionar tarefas'"
          class="h-14 text-lg px-4 pr-12 shadow-sm border-2 focus-visible:ring-0 focus-visible:border-primary transition-colors bg-background"
          :class="{ 'opacity-50': !canSave }"
          :disabled="isSaving"
          autocomplete="off"
        />
        <div class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <CornerDownLeft class="w-5 h-5" :class="{ 'opacity-50': !newTask }" />
        </div>
      </div>
    </div>
    <p class="text-xs text-muted-foreground mt-2 ml-1">
      Pressione <kbd class="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"><span class="text-xs">↵</span></kbd> para salvar automaticamente
    </p>
  </div>
</template>
