<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import Input from '@/components/ui/input/Input.vue'
import { CornerDownLeft } from 'lucide-vue-next'

const client = useSupabaseClient<any>()
const user = useSupabaseUser()
const emit = defineEmits(['task-added'])

// Props removed as we don't need groups anymore for general task creation
// but keeping them defined optional to avoid breaking parent usage immediately if not updated
const props = defineProps<{
  groups?: any[]
  currentGroupId?: number | null
}>()

const newTask = ref('')
const isSaving = ref(false)

const canSave = computed(() => {
  const hasId = !!(user.value?.id || (user.value as any)?.sub)
  return hasId
})

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
    const payload: any = {
      title: title,
      user_id: userId,
      is_completed: false
    }

    // LOG DE DEBUG
    console.log('Tentando salvar tarefa. CurrentGroupId:', props.currentGroupId, 'Type:', typeof props.currentGroupId)

    // Se estivermos em um grupo específico, associa a tarefa a ele
    if (props.currentGroupId !== null && props.currentGroupId !== undefined) {
      payload.view_group_id = props.currentGroupId
      console.log('Associando tarefa ao grupo:', props.currentGroupId)
    } else {
      console.log('Tarefa sem grupo associado.')
    }

    const { data: taskData, error: taskError } = await client
      .from('todos')
      .insert(payload)
      .select()
      .single()

    if (taskError) throw taskError

    // 2. Insert into todo_groups (Associação N:N)
    // Isso é necessário porque o RecentTasks.vue filtra usando essa tabela de junção
    if (props.currentGroupId !== null && props.currentGroupId !== undefined && taskData) {
        console.log('Criando associação na tabela todo_groups...')
        const { error: relationError } = await client
          .from('todo_groups')
          .insert({
            todo_id: taskData.id,
            group_id: props.currentGroupId,
            user_id: userId
          })
        
        if (relationError) {
          console.error('Erro ao criar associação com grupo:', relationError)
          // Não vamos falhar a criação da tarefa por isso, mas logamos o erro
        } else {
          console.log('Associação criada com sucesso.')
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
  <div class="w-full">
    <div class="relative w-full">
      <Input
        name="quick-capture"
        v-model="newTask"
        @keydown="handleKeydown"
        :placeholder="canSave ? 'O que precisa ser feito?' : 'Faça login para adicionar tarefas'"
        class="h-10 text-base px-4 pr-10 shadow-sm border focus-visible:ring-0 focus-visible:border-primary transition-colors bg-background w-full"
        :class="{ 'opacity-50': !canSave }"
        :disabled="isSaving"
        autocomplete="off"
      />
      <div class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <CornerDownLeft class="w-4 h-4" :class="{ 'opacity-50': !newTask }" />
      </div>
    </div>
  </div>
</template>
