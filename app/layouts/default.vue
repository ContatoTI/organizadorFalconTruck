<template>
  <div class="flex h-screen bg-background">
    <!-- Sidebar -->
    <aside class="w-64 border-r bg-card hidden md:flex flex-col">
      <div class="p-6 border-b">
        <h1 class="text-xl font-bold">Organizador</h1>
      </div>
      
      <div class="flex-1 overflow-y-auto">
        <div v-if="!user" class="p-4">
          <NuxtLink 
            to="/login" 
            class="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors justify-center"
          >
            <LogIn class="w-4 h-4" />
            <span>Entrar / Login</span>
          </NuxtLink>
          <p class="text-xs text-muted-foreground mt-2 text-center">
            Faça login para ver suas tarefas.
          </p>
        </div>

        <nav v-else class="p-4 space-y-6">
          <div class="space-y-2">
            <NuxtLink 
              to="/" 
              class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              active-class="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            >
              <LayoutDashboard class="w-5 h-5" />
              Dashboard
            </NuxtLink>
            <NuxtLink 
              to="/calendar" 
              class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              active-class="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            >
              <Calendar class="w-5 h-5" />
              Calendário
            </NuxtLink>
          </div>
          
          <!-- Blocos de Tempo -->
          <div>
             <div class="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
               <span>Blocos de Tempo</span>
               <div class="flex items-center gap-1">
                 <NuxtLink to="/groups?action=create&type=time" class="hover:text-foreground"><Plus class="w-3 h-3" /></NuxtLink>
                 <NuxtLink to="/groups" class="hover:text-foreground"><Settings class="w-3 h-3" /></NuxtLink>
               </div>
             </div>
             
             <div v-if="loadingGroups" class="px-3 py-2 text-xs text-muted-foreground">
               Carregando...
             </div>
             <div v-else class="space-y-1">
                <div 
                  v-for="group in timeGroups" 
                  :key="group.id"
                  class="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors cursor-pointer border border-transparent"
                  :class="{ 'bg-accent/30 border-primary border-dashed': dragOverGroupId === group.id }"
                  @dragover.prevent="onDragOver(group.id)"
                  @dragleave="onDragLeave"
                  @drop="onDrop($event, group.id)"
                  @click="$router.push(`/?group=${group.id}`)"
                >
                  <component 
                    :is="getIconComponent(group.icon)" 
                    class="w-4 h-4"
                    :style="{ color: group.color || 'currentColor' }" 
                  />
                  <span class="truncate">{{ group.title }}</span>
                </div>
                <div v-if="timeGroups.length === 0" class="px-3 text-xs text-muted-foreground italic">
                  Nenhum bloco definido
                </div>
             </div>
          </div>

          <!-- Listas e Contextos -->
          <div>
             <div class="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
               <span>Listas</span>
               <div class="flex items-center gap-1">
                 <NuxtLink to="/groups?action=create&type=list" class="hover:text-foreground"><Plus class="w-3 h-3" /></NuxtLink>
                 <NuxtLink to="/groups" class="hover:text-foreground"><Settings class="w-3 h-3" /></NuxtLink>
               </div>
             </div>
             
             <div v-if="loadingGroups" class="px-3 py-2 text-xs text-muted-foreground">
               Carregando...
             </div>
             <div v-else class="space-y-1">
                <div 
                  v-for="group in listGroups" 
                  :key="group.id"
                  class="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors cursor-pointer border border-transparent"
                  :class="{ 'bg-accent/30 border-primary border-dashed': dragOverGroupId === group.id }"
                  @dragover.prevent="onDragOver(group.id)"
                  @dragleave="onDragLeave"
                  @drop="onDrop($event, group.id)"
                  @click="$router.push(`/?group=${group.id}`)"
                >
                  <component 
                    :is="getIconComponent(group.icon)" 
                    class="w-4 h-4"
                    :style="{ color: group.color || 'currentColor' }" 
                  />
                  <span class="truncate">{{ group.title }}</span>
                </div>
                <div v-if="listGroups.length === 0" class="px-3 text-xs text-muted-foreground italic">
                  Nenhuma lista criada
                </div>
             </div>
          </div>

          <!-- Categorias -->
          <div>
             <div class="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
               <span>Categorias</span>
               <div class="flex items-center gap-1">
                 <NuxtLink to="/groups?action=create&type=category" class="hover:text-foreground"><Plus class="w-3 h-3" /></NuxtLink>
                 <NuxtLink to="/groups" class="hover:text-foreground"><Settings class="w-3 h-3" /></NuxtLink>
               </div>
             </div>
             
             <div v-if="loadingGroups" class="px-3 py-2 text-xs text-muted-foreground">
               Carregando...
             </div>
             <div v-else class="space-y-1">
                <div 
                  v-for="group in categoryGroups" 
                  :key="group.id"
                  class="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors cursor-pointer border border-transparent"
                  :class="{ 'bg-accent/30 border-primary border-dashed': dragOverGroupId === group.id }"
                  @dragover.prevent="onDragOver(group.id)"
                  @dragleave="onDragLeave"
                  @drop="onDrop($event, group.id)"
                  @click="$router.push(`/?group=${group.id}`)"
                >
                  <component 
                    :is="getIconComponent(group.icon)" 
                    class="w-4 h-4"
                    :style="{ color: group.color || 'currentColor' }" 
                  />
                  <span class="truncate">{{ group.title }}</span>
                </div>
                <div v-if="categoryGroups.length === 0" class="px-3 text-xs text-muted-foreground italic">
                  Nenhuma categoria
                </div>
             </div>
          </div>

          <!-- Finanças -->
          <div>
             <div class="flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
               <span>Finanças</span>
             </div>
             
             <div class="space-y-1">
                <NuxtLink 
                  to="/finances?type=payable"
                  class="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors cursor-pointer border border-transparent"
                  :class="{ 'bg-accent/50 text-foreground': route.path === '/finances' && route.query.type === 'payable' }"
                >
                  <ArrowUpCircle class="w-4 h-4 text-red-500" />
                  <span class="truncate">A pagar</span>
                </NuxtLink>
                <NuxtLink 
                  to="/finances?type=receivable"
                  class="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors cursor-pointer border border-transparent"
                  :class="{ 'bg-accent/50 text-foreground': route.path === '/finances' && route.query.type === 'receivable' }"
                >
                  <ArrowDownCircle class="w-4 h-4 text-emerald-500" />
                  <span class="truncate">A receber</span>
                </NuxtLink>
             </div>
          </div>

        </nav>
      </div>

      <div class="p-4 border-t space-y-2">
        <div v-if="user" class="px-3 py-2 rounded-md bg-secondary/20 mb-2">
          <p class="text-xs font-medium truncate">{{ user.user_metadata?.name || user.user_metadata?.full_name || 'Usuário' }}</p>
          <p class="text-[10px] text-muted-foreground truncate" :title="user.email">{{ user.email }}</p>
        </div>
        <button 
          v-if="user"
          @click="handleLogout"
          class="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut class="w-4 h-4" />
          <span>Sair</span>
        </button>
        <div class="text-xs text-muted-foreground text-center">
          v0.1.0
        </div>
      </div>
    </aside>

    <!-- Mobile Header (Visible only on small screens) -->
    <div class="md:hidden flex flex-col flex-1">
      <header class="h-16 border-b flex items-center px-4 justify-between bg-card">
        <h1 class="font-bold">Organizador</h1>
        <!-- Mobile Menu Button could go here -->
      </header>
      <main class="flex-1 overflow-auto bg-secondary/10">
        <slot />
      </main>
      <!-- Mobile Bottom Nav -->
      <nav class="h-16 border-t bg-card flex items-center justify-around px-2">
        <NuxtLink to="/" class="p-2 rounded-md" active-class="text-primary"><LayoutDashboard class="w-6 h-6" /></NuxtLink>
        <NuxtLink to="/calendar" class="p-2 rounded-md" active-class="text-primary"><Calendar class="w-6 h-6" /></NuxtLink>
        <NuxtLink to="/groups" class="p-2 rounded-md" active-class="text-primary"><Clock class="w-6 h-6" /></NuxtLink>
      </nav>
    </div>

    <!-- Desktop Main Content -->
    <main class="flex-1 overflow-auto bg-secondary/10 hidden md:block">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { LayoutDashboard, Target, CheckSquare, Calendar, Clock, Settings, Plus, LogIn, LogOut, DollarSign, ArrowUpCircle, ArrowDownCircle } from 'lucide-vue-next'
import { getIconComponent } from '@/utils/icons'

const client = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

const route = useRoute()
const groups = ref<any[]>([])
const loadingGroups = ref(false)
const dragOverGroupId = ref<number | null>(null)

const timeGroups = computed(() => groups.value.filter(g => (!g.type && g.title !== 'Compras' && g.title !== 'Finanças') || g.type === 'time'))
const listGroups = computed(() => groups.value.filter(g => g.type === 'list'))
const categoryGroups = computed(() => groups.value.filter(g => (g.type === 'category' || (!g.type && g.title === 'Compras')) && g.title !== 'Finanças'))

const handleLogout = async () => {
  await client.auth.signOut()
  router.push('/login')
}

const fetchGroups = async () => {
  // Try to get user from composable or session
  let currentUserId = user.value?.id
  
  if (!currentUserId) {
    const { data } = await client.auth.getSession()
    currentUserId = data.session?.user?.id
  }

  if (!currentUserId) {
    // console.log('No user logged in, skipping fetchGroups')
    return
  }
  
  loadingGroups.value = true
  try {
    const { data, error } = await client.from('view_groups').select('*').order('start_time')
    if (error) {
      console.error('Error fetching groups:', error)
    } else {
      // console.log('Fetched groups in default.vue:', data?.length)
    }
    groups.value = data || []
  } catch (e) {
    console.error('Exception fetching groups:', e)
  } finally {
    loadingGroups.value = false
  }
}

const ensureDefaultGroups = async () => {
  let currentUserId = user.value?.id
  if (!currentUserId) {
     const { data } = await client.auth.getSession()
     currentUserId = data.session?.user?.id
  }
  
  if (!currentUserId) return

  try {
    // Create Compras group if not exists
    const { data: existingCompras } = await client
      .from('view_groups')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('title', 'Compras')
      .maybeSingle()

    if (!existingCompras) {
      const { error } = await client.from('view_groups').insert({
        title: 'Compras',
        user_id: currentUserId,
        type: 'category'
      })
      if (error) console.error('Error creating Compras group:', error)
    }

    // Create Finanças group if not exists
    const { data: existingFinancas } = await client
      .from('view_groups')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('title', 'Finanças')
      .maybeSingle()

    if (!existingFinancas) {
      const { error } = await client.from('view_groups').insert({
        title: 'Finanças',
        user_id: currentUserId,
        type: 'category',
        icon: 'DollarSign',
        color: '#10b981'
      })
      if (error) console.error('Error creating Finanças group:', error)
    }

    await fetchGroups()
  } catch (e) {
    console.error('Error in ensureDefaultGroups:', e)
  }
}

const onDragOver = (groupId: number) => {
  dragOverGroupId.value = groupId
}

const onDragLeave = () => {
  dragOverGroupId.value = null
}

const onDrop = async (event: DragEvent, groupId: number) => {
  dragOverGroupId.value = null
  const taskId = event.dataTransfer?.getData('text/plain')
  
  if (taskId) {
    // console.log('Dropping task:', { taskId, groupId })
    try {
      // Use RPC function to bypass complex RLS issues and ensure atomic operation
      const { error } = await client.rpc('add_todo_to_group', {
        p_todo_id: parseInt(taskId),
        p_group_id: groupId
      })
      
      if (error) {
        console.error('Supabase RPC error:', error)
        throw error
      }
      
      // Emit a custom event on window for simplicity
      window.dispatchEvent(new CustomEvent('task-updated'))
      
    } catch (e) {
      console.error('Error adding task to group:', e)
    }
  }
}

onMounted(async () => {
  // Check session directly on mount
  const { data } = await client.auth.getSession()
  if (data.session?.user || user.value) {
    await fetchGroups()
    ensureDefaultGroups()
  }
  
  // Listen for updates (e.g. group created)
  window.addEventListener('group-updated', () => fetchGroups())
})

watch(user, (u) => {
  if (u) {
    // console.log('User authenticated, fetching groups...')
    // Wait a tick to ensure client is ready
    setTimeout(() => {
      fetchGroups().then(() => ensureDefaultGroups())
    }, 100)
    
    // If on login page, redirect to home
    if (route.path === '/login') {
      router.push('/')
    }
  } else {
    // If not authenticated and not on login page, redirect to login
    if (route.path !== '/login') {
      console.log('User not authenticated, redirecting to login...')
      router.push('/login')
    }
  }
}, { immediate: true })
</script>
