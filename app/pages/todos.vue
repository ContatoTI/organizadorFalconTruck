<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import QuickCapture from '@/components/QuickCapture.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Trash2 } from 'lucide-vue-next'

const client = useSupabaseClient()
const user = useSupabaseUser()
const todos = ref<any[]>([])
const loading = ref(false)
const showDeleteConfirm = ref(false)
const todoToDelete = ref<number | null>(null)

const effectiveUserId = computed(() => user.value?.id)

const fetchTasks = async () => {
  if (!effectiveUserId.value) {
    todos.value = []
    return
  }
  
  loading.value = true
  try {
    const { data, error } = await client
      .from('todos')
      .select('*')
      .eq('user_id', effectiveUserId.value)
      .order('created_at', { ascending: false })
      
    if (error) throw error
    todos.value = data || []
  } catch (e) {
    console.error('Error fetching todos:', e)
  } finally {
    loading.value = false
  }
}

const toggleTodo = async (todo: any) => {
  const newValue = !todo.is_completed
  // Optimistic update
  todo.is_completed = newValue
  
  try {
    const { error } = await client
      .from('todos')
      .update({ is_completed: newValue })
      .eq('id', todo.id)
      
    if (error) {
      todo.is_completed = !newValue // Revert
      throw error
    }
  } catch (e: any) {
    console.error('Error updating todo:', e)
    alert('Erro ao atualizar tarefa: ' + e.message)
    todo.is_completed = !newValue // Revert
  }
}

const requestDelete = (id: number) => {
  todoToDelete.value = id
  showDeleteConfirm.value = true
}

const confirmDelete = async () => {
  if (!todoToDelete.value) return
  const id = todoToDelete.value
  showDeleteConfirm.value = false
  todoToDelete.value = null

  // Optimistic remove
  const original = [...todos.value]
  todos.value = todos.value.filter(t => t.id !== id)

  try {
    const { error } = await client
      .from('todos')
      .delete()
      .eq('id', id)
      
    if (error) throw error
  } catch (e: any) {
    console.error('Error deleting todo:', e)
    todos.value = original // Revert
    alert('Erro ao excluir tarefa: ' + e.message)
  }
}

watch(effectiveUserId, (newId) => {
  if (newId) fetchTasks()
}, { immediate: true })

</script>

<template>
  <div class="p-6 w-full">
    <ConfirmDialog 
      :isOpen="showDeleteConfirm"
      title="Excluir tarefa"
      description="Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita."
      confirmText="Excluir"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
    <h1 class="text-3xl font-bold mb-8">Afazeres</h1>
    
    <QuickCapture @task-added="fetchTasks" />
    
    <div class="space-y-4 mt-8">
      <div v-if="loading" class="text-center py-8 text-muted-foreground">
        Carregando tarefas...
      </div>
      
      <div v-else-if="todos.length === 0" class="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
        <p>Nenhuma tarefa encontrada.</p>
        <p class="text-sm mt-2">Adicione uma tarefa acima para começar.</p>
      </div>
      
      <div 
        v-else
        v-for="todo in todos" 
        :key="todo.id"
        class="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors group"
      >
        <input 
          type="checkbox" 
          :checked="todo.is_completed" 
          @change="toggleTodo(todo)"
          class="w-5 h-5 rounded border-primary text-primary focus:ring-primary cursor-pointer"
        />
        
        <span 
          class="flex-1 text-lg transition-all"
          :class="{ 'line-through text-muted-foreground': todo.is_completed }"
        >
          {{ todo.title }}
        </span>
        
        <button 
          @click.stop="requestDelete(todo.id)"
          class="p-2 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Excluir tarefa"
        >
          <Trash2 class="w-5 h-5" />
        </button>
      </div>
    </div>
  </div>
</template>