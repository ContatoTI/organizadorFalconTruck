<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Grupos de Visualização</h1>
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
            <div class="space-y-2">
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
            
            <div v-if="formGroup.type === 'time'" class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="start_time">Início</Label>
                <Input id="start_time" type="time" v-model="formGroup.start_time" required />
              </div>
              <div class="space-y-2">
                <Label for="end_time">Fim</Label>
                <Input id="end_time" type="time" v-model="formGroup.end_time" required />
              </div>
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
              v-for="group in groups" 
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
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                @click.stop="deleteGroup(group.id)" 
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                Excluir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import Button from '@/components/ui/button/Button.vue'
import Card from '@/components/ui/card/Card.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import Input from '@/components/ui/input/Input.vue'
import Label from '@/components/ui/label/Label.vue'
import { 
  Briefcase, Home, Coffee, Sun, Moon, Star, Heart, Book, Laptop, Smartphone, ShoppingCart, Zap,
  Folder, Calendar, Clock, CheckCircle
} from 'lucide-vue-next'

const client = useSupabaseClient()
const user = useSupabaseUser()

const loading = ref(false)
const loadingGroups = ref(false)
const groups = ref<any[]>([])
const isEditing = ref(false)
const editingId = ref<number | null>(null)

const formGroup = ref({
  title: '',
  start_time: '',
  end_time: '',
  color: '#6366f1',
  icon: 'Folder',
  type: 'time'
})

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
  formGroup.value = {
    title: group.title,
    start_time: group.start_time ? group.start_time.substring(0, 5) : '',
    end_time: group.end_time ? group.end_time.substring(0, 5) : '',
    color: group.color || '#6366f1',
    icon: group.icon || 'Folder',
    type: group.type || 'time'
  }
}

const cancelEdit = () => {
  isEditing.value = false
  editingId.value = null
  formGroup.value = {
    title: '',
    start_time: '',
    end_time: '',
    color: '#6366f1',
    icon: 'Folder',
    type: 'time'
  }
}

const saveGroup = async () => {
  if (!user.value) return
  
  loading.value = true
  try {
    const payload = {
      title: formGroup.value.title,
      start_time: formGroup.value.type === 'time' && formGroup.value.start_time ? formGroup.value.start_time : null,
      end_time: formGroup.value.type === 'time' && formGroup.value.end_time ? formGroup.value.end_time : null,
      color: formGroup.value.color,
      icon: formGroup.value.icon,
      type: formGroup.value.type
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

const deleteGroup = async (id: number) => {
  if (!confirm('Tem certeza que deseja excluir este grupo?')) return
  
  try {
    const { error } = await client
      .from('view_groups')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    if (editingId.value === id) {
      cancelEdit()
    }
    await fetchGroups()
  } catch (e) {
    console.error('Error deleting group:', e)
  }
}

const formatTime = (time: string | null | undefined) => {
  if (!time) return '--:--'
  // Simple format, assuming HH:MM:SS or HH:MM
  return time.substring(0, 5)
}

const route = useRoute()

onMounted(() => {
  if (user.value) fetchGroups()
  
  // Check for create action
  if (route.query.action === 'create' && route.query.type) {
    cancelEdit() // Reset form
    formGroup.value.type = route.query.type as string
  }
})

watch(user, (u) => {
  if (u) fetchGroups()
}, { immediate: true })
</script>
