<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import QuickCapture from '@/components/QuickCapture.vue'
import RecentTasks from '@/components/RecentTasks.vue'
import Button from '@/components/ui/button/Button.vue'
import Card from '@/components/ui/card/Card.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import CardFooter from '@/components/ui/card/CardFooter.vue'
import Input from '@/components/ui/input/Input.vue'
import Label from '@/components/ui/label/Label.vue'

const user = useSupabaseUser()
const client = useSupabaseClient()
const route = useRoute()

const groups = ref<any[]>([])
const activeGroupsByTime = ref<any[]>([])
// Default to 'auto' to show relevant tasks or all tasks if no group is active
const selectedMode = ref<'auto' | 'all' | 'inbox' | number>('auto')
let timeInterval: any = null

const calculateCurrentGroup = () => {
  if (!groups.value.length) {
    activeGroupsByTime.value = []
    return
  }

  const now = new Date()
  const currentTime = now.toTimeString().slice(0, 5)

  const active = groups.value.filter(g => {
    // Ignore groups without time or list type groups (unless they have time set, but user specified "time blocks")
    if (!g.start_time || !g.end_time) return false
    
    // Handle cross-midnight groups (e.g. 23:00 to 02:00)
    if (g.start_time <= g.end_time) {
      return currentTime >= g.start_time && currentTime < g.end_time
    } else {
      // Crosses midnight
      return currentTime >= g.start_time || currentTime < g.end_time
    }
  })

  activeGroupsByTime.value = active
}

const fetchGroups = async () => {
  if (!user.value) return
  console.log('Fetching groups in index.vue')
  try {
    const { data, error } = await client.from('view_groups').select('*').order('start_time')
    if (error) throw error
    groups.value = data || []
    console.log('Fetched groups in index.vue:', groups.value.length)
    calculateCurrentGroup()
  } catch (e) {
    console.error('Error fetching groups in index.vue:', e)
  }
}

const effectiveGroupIdForList = computed(() => {
  if (selectedMode.value === 'auto') {
    // If multiple groups, this should be undefined so viewGroupIds takes over
    // If no groups, undefined (shows all)
    return undefined
  }
  if (selectedMode.value === 'all') return undefined // Show all tasks
  if (selectedMode.value === 'inbox') return null // Show only tasks with view_group_id IS NULL
  return selectedMode.value // Show tasks for specific group
})

const effectiveGroupIdsForList = computed(() => {
  if (selectedMode.value === 'auto') {
    return activeGroupsByTime.value.map(g => g.id)
  }
  return undefined
})

const effectiveGroupIdForCapture = computed(() => {
  if (selectedMode.value === 'auto') {
    // Default to first active group or null
    return activeGroupsByTime.value.length > 0 ? activeGroupsByTime.value[0].id : null
  }
  if (selectedMode.value === 'all') return null
  if (selectedMode.value === 'inbox') return null
  return selectedMode.value
})

const onTaskAdded = () => {
  // Refresh tasks logic is handled inside RecentTasks via emit/expose usually, 
  // but here we are using a global event bus 'task-added' in QuickCapture?
  // Actually QuickCapture emits 'task-added', so we can listen to it.
  // RecentTasks exposes refresh, we can call it.
}

const recentTasksRef = ref()
const handleTaskAdded = () => {
  if (selectedMode.value === 'auto') {
    // Force refresh all RecentTasks instances
    // Since we can't easily ref v-for components, we rely on the window event or create a mechanism
    // But wait, RecentTasks listens to 'task-updated' event.
    // QuickCapture emits 'task-added'.
    // We should trigger a global event or fetchGroups/Tasks
    
    // Dispatch global event that RecentTasks listens to
    window.dispatchEvent(new Event('task-updated'))
  } else {
    recentTasksRef.value?.refresh()
  }
}

onMounted(() => {
  if (user.value) {
    fetchGroups()
    timeInterval = setInterval(calculateCurrentGroup, 60000)
  }
})

watch(user, (u) => {
  if (u) {
    fetchGroups()
    if (!timeInterval && import.meta.client) {
      timeInterval = setInterval(calculateCurrentGroup, 60000)
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval)
})

// Handle query params for deep linking to groups
watch(() => route.query.group, (newGroup) => {
  if (newGroup) {
    selectedMode.value = Number(newGroup)
  } else {
    // If query removed, revert to default 'inbox'
    selectedMode.value = 'inbox'
  }
}, { immediate: true })

</script>

<template>
  <div class="p-8 max-w-4xl mx-auto space-y-8">
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 class="text-4xl font-bold tracking-tight mb-2">
          {{ 
            selectedMode === 'inbox' ? 'Caixa de Entrada' : 
            selectedMode === 'all' ? 'Todas as Tarefas' :
            selectedMode === 'auto' ? (activeGroupsByTime.length ? `Automático (${activeGroupsByTime.map(g => g.title).join(', ')})` : 'Automático') :
            groups.find(g => g.id === selectedMode)?.title || 'Tarefas'
          }}
        </h1>
        <p class="text-muted-foreground">
          {{ 
             selectedMode === 'inbox' ? 'Tarefas sem grupo definido.' :
             'Gerencie suas tarefas.' 
          }}
        </p>
      </div>
      
      <div class="flex items-center gap-2">
        <select 
          v-model="selectedMode" 
          class="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="inbox">Caixa de Entrada (Sem Grupo)</option>
          <option value="auto">Automático {{ activeGroupsByTime.length ? `(${activeGroupsByTime.map(g => g.title).join(', ')})` : '' }}</option>
          <option value="all">Todas as Tarefas</option>
          <option disabled>──────────</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.title }}
          </option>
        </select>
      </div>
    </div>

    <!-- Quick Capture -->
    <QuickCapture 
      :groups="groups" 
      :current-group-id="effectiveGroupIdForCapture"
      @task-added="handleTaskAdded"
    />

    <!-- Task List -->
    <template v-if="selectedMode === 'auto'">
      <div v-if="activeGroupsByTime.length === 0" class="text-center py-4 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
        <p>Nenhum bloco de tempo ativo neste horário.</p>
        <button class="text-primary hover:underline text-sm" @click="selectedMode = 'all'">Ver todas as tarefas</button>
      </div>

      <!-- Active Groups -->
      <RecentTasks 
        v-for="group in activeGroupsByTime"
        :key="group.id"
        :view-group-id="group.id"
        :group-color="group.color"
        :group-title="group.title"
        :hide-empty="false"
      />
      
      <!-- Inbox (Always show in auto mode, separated) -->
      <RecentTasks 
        :view-group-id="null"
        group-title="Sem Bloco"
      />
    </template>
    
    <template v-else>
      <RecentTasks 
        ref="recentTasksRef"
        :view-group-id="effectiveGroupIdForList"
        :view-group-ids="effectiveGroupIdsForList"
      />
    </template>
  </div>
</template>
