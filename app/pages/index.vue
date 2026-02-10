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
const showOnlyActiveBlocks = ref(false)
let timeInterval: any = null

const calculateCurrentGroup = () => {
  if (!groups.value.length) {
    activeGroupsByTime.value = []
    return
  }

  const now = new Date()
  const currentTime = now.toTimeString().slice(0, 5)

  const active = groups.value.filter(g => {
    return isGroupActive(g)
  })

  activeGroupsByTime.value = active
}

const timeBlockGroups = computed(() => {
  const allBlocks = groups.value.filter(g => g.start_time && g.end_time)
  if (showOnlyActiveBlocks.value) {
    return allBlocks.filter(g => isGroupActive(g))
  }
  return allBlocks
})

const customListGroups = computed(() => {
  return groups.value.filter(g => !g.start_time || !g.end_time)
})

const isGroupActive = (group: any) => {
    if (!group.start_time || !group.end_time) return false
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 5)
    
    if (group.start_time <= group.end_time) {
      return currentTime >= group.start_time && currentTime < group.end_time
    } else {
      // Crosses midnight
      return currentTime >= group.start_time || currentTime < group.end_time
    }
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
    // If query removed, revert to default 'auto'
    selectedMode.value = 'auto'
  }
}, { immediate: true })

watch(selectedMode, (val) => {
  console.log('Selected Mode alterado para:', val)
})

</script>

<template>
  <div class="p-8 w-full space-y-8">
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 class="text-4xl font-bold tracking-tight mb-2">
          {{ 
            selectedMode === 'inbox' ? 'Caixa de Entrada' : 
            selectedMode === 'all' ? 'Todas as Tarefas' :
            selectedMode === 'auto' ? 'Visão Geral' :
            groups.find(g => g.id === selectedMode)?.title || 'Tarefas'
          }}
        </h1>
        <p class="text-muted-foreground">
          {{ 
             selectedMode === 'inbox' ? 'Tarefas sem grupo definido.' :
             selectedMode === 'auto' ? (activeGroupsByTime.length ? `Foco atual: ${activeGroupsByTime.map(g => g.title).join(', ')}` : 'Gerencie seu dia com foco.') :
             'Gerencie suas tarefas.' 
          }}
        </p>
      </div>
      
      <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button 
          @click="selectedMode = 'auto'"
          class="px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
          :class="selectedMode === 'auto' 
            ? 'bg-primary text-primary-foreground shadow-md' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'"
        >
          Blocos de Tempo
        </button>

        <div class="w-px h-6 bg-border mx-1 flex-shrink-0"></div>

        <button 
          v-for="group in customListGroups"
          :key="group.id"
          @click="selectedMode = group.id"
          class="px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
          :class="selectedMode === group.id
            ? 'bg-primary text-primary-foreground shadow-md' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'"
        >
          {{ group.title }}
        </button>

        <button 
          @click="selectedMode = 'inbox'"
          class="px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
          :class="selectedMode === 'inbox' 
            ? 'bg-primary text-primary-foreground shadow-md' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'"
        >
          Caixa de Entrada
        </button>
      </div>
    </div>

    <!-- Task List -->
    <template v-if="selectedMode === 'auto'">
      
      <!-- Sub-filter for Time Blocks AND Quick Capture -->
      <div class="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
        <!-- Quick Capture (moved here) -->
        <div class="w-full md:w-1/2">
            <QuickCapture 
              :groups="groups" 
              :current-group-id="effectiveGroupIdForCapture"
              @task-added="handleTaskAdded"
            />
        </div>

        <div class="inline-flex items-center p-1 bg-muted rounded-lg shrink-0">
          <button 
            @click="showOnlyActiveBlocks = false"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
            :class="!showOnlyActiveBlocks ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            Todos os Blocos
          </button>
          <button 
            @click="showOnlyActiveBlocks = true"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
            :class="showOnlyActiveBlocks ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Apenas Atuais
          </button>
        </div>
      </div>

      <!-- Tarefas da Caixa de Entrada (Sem grupo) -->
      <RecentTasks 
        :view-group-id="null"
        group-title="Caixa de Entrada"
        :hide-empty="true"
        class="!mt-4 mb-8"
      />

      <div class="space-y-4">
        <div 
          v-for="group in timeBlockGroups" 
          :key="group.id"
          class="transition-all duration-300"
          :class="isGroupActive(group) ? 'scale-[1.01]' : 'opacity-80 hover:opacity-100'"
        >
          <RecentTasks 
            :view-group-id="group.id"
            :group-color="group.color"
            :group-title="group.title + (group.start_time ? ` (${group.start_time.slice(0,5)} - ${group.end_time?.slice(0,5)})` : '')"
            :hide-empty="false"
          />
        </div>

        <div v-if="timeBlockGroups.length === 0" class="text-center py-10 text-muted-foreground">
           Nenhum bloco de tempo configurado.
        </div>
      </div>
    </template>
    
    <template v-else>
      <div class="mb-4">
          <QuickCapture 
            :groups="groups" 
            :current-group-id="effectiveGroupIdForCapture"
            @task-added="handleTaskAdded"
          />
      </div>
      <RecentTasks 
        ref="recentTasksRef"
        :view-group-id="effectiveGroupIdForList"
        :view-group-ids="effectiveGroupIdsForList"
      />
    </template>
  </div>
</template>
