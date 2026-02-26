<script setup lang="ts">
import { ref } from 'vue'

const client = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const message = ref('')

const handleLogin = async () => {
  loading.value = true
  errorMsg.value = ''
  message.value = ''
  
  try {
    const { error } = await client.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })
    
    if (error) throw error
    
    router.push('/')
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}

const handleMagicLink = async () => {
  loading.value = true
  errorMsg.value = ''
  message.value = ''
  
  try {
    const { error } = await client.auth.signInWithOtp({
      email: email.value
    })
    
    if (error) throw error
    
    message.value = 'Link de login enviado para seu email!'
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}

watch(user, (u) => {
  if (u) {
    router.push('/')
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-full max-w-md space-y-8 p-8 border rounded-lg shadow-lg bg-card text-card-foreground">
      <div class="text-center">
        <h2 class="text-3xl font-bold tracking-tight">Entrar</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Acesse sua conta para ver suas tarefas
        </p>
      </div>
      
      <div class="space-y-6">
        <div>
          <label for="email" class="block text-sm font-medium">Email</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            required
            class="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="seu@email.com"
          />
        </div>
        
        <div>
          <label for="password" class="block text-sm font-medium">Senha (Opcional se usar Magic Link)</label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            class="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div v-if="errorMsg" class="text-red-500 text-sm">
          {{ errorMsg }}
        </div>
        
        <div v-if="message" class="text-green-500 text-sm">
          {{ message }}
        </div>

        <div class="flex flex-col gap-3">
          <button
            @click="handleLogin"
            :disabled="loading || !password"
            class="flex w-full justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {{ loading ? 'Entrando...' : 'Entrar com Senha' }}
          </button>
          
          <button
            @click="handleMagicLink"
            :disabled="loading || !email"
            class="flex w-full justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {{ loading ? 'Enviando...' : 'Enviar Magic Link' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
