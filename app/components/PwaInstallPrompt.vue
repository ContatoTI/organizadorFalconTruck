<template>
  <div v-if="deferredPrompt || (debugMode && !isInstalled)" class="fixed bottom-4 right-4 z-50 p-4 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg flex flex-col gap-3 max-w-xs transition-all duration-300">
    <div class="flex items-start justify-between">
      <div>
        <h3 class="font-semibold text-sm">Instalar App</h3>
        <p class="text-xs text-muted-foreground mt-1">Instale para acesso rápido e offline.</p>
      </div>
      <button @click="dismiss" class="text-muted-foreground hover:text-foreground">
        <span class="sr-only">Fechar</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    
    <div v-if="debugMode" class="p-2 bg-muted/50 rounded text-[10px] space-y-1 font-mono">
      <p class="font-semibold">Debug PWA:</p>
      <div class="flex justify-between"><span>Prompt:</span> <span :class="deferredPrompt ? 'text-green-600' : 'text-red-500'">{{ deferredPrompt ? 'Capturado' : 'Aguardando...' }}</span></div>
      <div class="flex justify-between"><span>SW:</span> <span :class="swRegistered ? 'text-green-600' : 'text-yellow-600'">{{ swRegistered ? 'Ativo' : 'Verificando...' }}</span></div>
      <div class="flex justify-between"><span>Modo:</span> <span>{{ isStandalone ? 'App' : 'Browser' }}</span></div>
    </div>

    <Button @click="installPwa" class="w-full h-8 text-xs" :disabled="!deferredPrompt">
      {{ deferredPrompt ? 'Instalar Agora' : 'Instalar (Indisponível)' }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from '@/components/ui/button/Button.vue'

// Use global state for the prompt
const deferredPrompt = useState<any>('pwa-deferred-prompt')
const debugMode = ref(true) // Mantendo true para o usuário ver o status
const isStandalone = ref(false)
const swRegistered = ref(false)
const isInstalled = ref(false)

const dismiss = () => {
  debugMode.value = false
  deferredPrompt.value = null
}

onMounted(async () => {
  // Check standalone mode
  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches
  isInstalled.value = isStandalone.value

  // Check SW registration
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    swRegistered.value = registrations.length > 0
    
    // Listen for SW updates
    navigator.serviceWorker.ready.then((registration) => {
      swRegistered.value = true
    })
  } else {
    // If serviceWorker is not supported or not active (e.g. dev mode disabled)
    swRegistered.value = false
  }
})

const installPwa = async () => {
  if (!deferredPrompt.value) {
    if (debugMode.value) {
      alert('O evento de instalação ainda não foi capturado pelo navegador.\n\nIsso pode ocorrer se:\n1. O app já estiver instalado.\n2. O navegador não suportar instalação.\n3. A página ainda estiver carregando.\n4. Você estiver em uma janela anônima.')
    }
    return
  }
  
  deferredPrompt.value.prompt()
  
  const { outcome } = await deferredPrompt.value.userChoice
  console.log(`User response to the install prompt: ${outcome}`)
  
  deferredPrompt.value = null
  if (outcome === 'accepted') {
    isInstalled.value = true
    debugMode.value = false
  }
}
</script>
