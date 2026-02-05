<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Plus, Trash2, Calendar as CalendarIcon, DollarSign, ArrowUpCircle, ArrowDownCircle } from 'lucide-vue-next'
import { format } from 'date-fns'

const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()

const type = computed(() => route.query.type as 'payable' | 'receivable' | undefined)
const title = computed(() => type.value === 'payable' ? 'Contas a Pagar' : type.value === 'receivable' ? 'Contas a Receber' : 'Finanças')
const transactions = ref<any[]>([])
const loading = ref(false)

// Form state
const isAdding = ref(false)
const newTransaction = ref({
  title: '',
  amount: 0,
  transaction_date: format(new Date(), 'yyyy-MM-dd'),
  type: 'payable',
  status: 'pending'
})

const fetchTransactions = async () => {
  if (!user.value) return
  loading.value = true
  
  let query = client.from('finance_transactions').select('*').order('transaction_date', { ascending: true })
  
  if (type.value) {
    query = query.eq('type', type.value)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching transactions:', error)
  } else {
    transactions.value = data || []
  }
  loading.value = false
}

const addTransaction = async () => {
  if (!newTransaction.value.title || !newTransaction.value.amount) return
  
  const { error } = await client.from('finance_transactions').insert({
    ...newTransaction.value,
    user_id: user.value.id,
    type: type.value || newTransaction.value.type // Use query type if available, else form type
  })
  
  if (error) {
    console.error('Error adding transaction:', error)
  } else {
    isAdding.value = false
    newTransaction.value = {
      title: '',
      amount: 0,
      transaction_date: format(new Date(), 'yyyy-MM-dd'),
      type: type.value || 'payable',
      status: 'pending'
    }
    fetchTransactions()
  }
}

const deleteTransaction = async (id: number) => {
  if (!confirm('Tem certeza que deseja excluir?')) return
  const { error } = await client.from('finance_transactions').delete().eq('id', id)
  if (error) console.error('Error deleting:', error)
  else fetchTransactions()
}

const toggleStatus = async (transaction: any) => {
  const newStatus = transaction.status === 'paid' ? 'pending' : 'paid'
  const { error } = await client.from('finance_transactions').update({ status: newStatus }).eq('id', transaction.id)
  if (error) console.error('Error updating status:', error)
  else transaction.status = newStatus
}

watch(() => route.query.type, (newType) => {
  if (newType) {
    newTransaction.value.type = newType as string
  }
  fetchTransactions()
}, { immediate: true })

onMounted(() => {
  fetchTransactions()
})

const totalPending = computed(() => transactions.value.filter(t => t.status === 'pending').reduce((sum, t) => sum + Number(t.amount), 0))
const totalPaid = computed(() => transactions.value.filter(t => t.status === 'paid').reduce((sum, t) => sum + Number(t.amount), 0))
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold flex items-center gap-2">
           <ArrowUpCircle v-if="type === 'payable'" class="w-8 h-8 text-red-500" />
           <ArrowDownCircle v-if="type === 'receivable'" class="w-8 h-8 text-emerald-500" />
           {{ title }}
        </h1>
        <p class="text-muted-foreground">Gerencie seus pagamentos e recebimentos.</p>
      </div>
      <button @click="isAdding = !isAdding" class="px-4 py-2 bg-primary text-primary-foreground rounded-md flex items-center gap-2 hover:bg-primary/90">
        <Plus class="w-4 h-4" /> Novo
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
        <div class="text-sm font-medium text-muted-foreground">Total Pendente</div>
        <div class="text-2xl font-bold">R$ {{ totalPending.toFixed(2) }}</div>
      </div>
      <div class="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
        <div class="text-sm font-medium text-muted-foreground">Total Realizado</div>
        <div class="text-2xl font-bold text-green-600">R$ {{ totalPaid.toFixed(2) }}</div>
      </div>
    </div>

    <!-- Add Form -->
    <div v-if="isAdding" class="p-4 rounded-lg border bg-muted/30 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="md:col-span-2">
          <label class="text-sm font-medium">Descrição</label>
          <input v-model="newTransaction.title" class="w-full px-3 py-2 rounded-md border bg-background" placeholder="Ex: Aluguel" />
        </div>
        <div>
          <label class="text-sm font-medium">Valor (R$)</label>
          <input v-model="newTransaction.amount" type="number" step="0.01" class="w-full px-3 py-2 rounded-md border bg-background" />
        </div>
        <div>
          <label class="text-sm font-medium">Data</label>
          <input v-model="newTransaction.transaction_date" type="date" class="w-full px-3 py-2 rounded-md border bg-background" />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button @click="isAdding = false" class="px-3 py-2 text-sm text-muted-foreground hover:bg-accent rounded-md">Cancelar</button>
        <button @click="addTransaction" class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Salvar</button>
      </div>
    </div>

    <!-- List -->
    <div class="space-y-2">
      <div v-if="loading" class="text-center py-8 text-muted-foreground">Carregando...</div>
      <div v-else-if="transactions.length === 0" class="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
        Nenhum registro encontrado.
      </div>
      <div v-else v-for="t in transactions" :key="t.id" class="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div class="flex items-center gap-4">
          <button @click="toggleStatus(t)" class="w-5 h-5 rounded-full border flex items-center justify-center transition-colors" :class="t.status === 'paid' ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground'">
            <svg v-if="t.status === 'paid'" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <div>
            <div class="font-medium" :class="{ 'line-through text-muted-foreground': t.status === 'paid' }">{{ t.title }}</div>
            <div class="text-xs text-muted-foreground flex items-center gap-2">
              <span>{{ format(new Date(t.transaction_date), 'dd/MM/yyyy') }}</span>
              <span v-if="!type" class="px-1.5 py-0.5 rounded-full text-[10px] uppercase border" :class="t.type === 'payable' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'">
                {{ t.type === 'payable' ? 'A Pagar' : 'A Receber' }}
              </span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="font-bold" :class="t.type === 'payable' ? 'text-red-600' : 'text-emerald-600'">
            {{ t.type === 'payable' ? '-' : '+' }} R$ {{ Number(t.amount).toFixed(2) }}
          </div>
          <button @click="deleteTransaction(t.id)" class="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
