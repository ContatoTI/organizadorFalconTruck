<template>
  <div v-if="deferredPrompt || debugMode" class="fixed bottom-4 right-4 z-50 p-4 bg-background border rounded-lg shadow-lg flex flex-col gap-2">
    <p class="text-sm font-medium">Instalar App Organizador</p>
    <div class="text-xs text-muted-foreground mb-2" v-if="debugMode">
      <p>Status Debug:</p>
      <ul class="list-disc pl-4">
        <li>Prompt capturado: {{ deferredPrompt ? 'Sim' : 'Não' }}</li>
        <li>Standalone: {{ isStandalone ? 'Sim' : 'Não' }}</li>
        <li>SW Registrado: {{ swRegistered ? 'Sim' : 'Não' }}</li>
      </ul>
    </div>
    <Button @click="installPwa" class="w-full" :disabled="!deferredPrompt">
      Instalar
    </Button>
    <button v-if="debugMode" @click="debugMode = false" class="text-xs text-muted-foreground underline">
      Fechar Debug
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from '@/components/ui/button/Button.vue'

const deferredPrompt = ref<any>(null)
const debugMode = ref(true) // Forçado para true para ajudar o usuário
const isStandalone = ref(false)
const swRegistered = ref(false)

onMounted(async () => {
  // Check standalone mode
  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches

  // Check SW registration
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    swRegistered.value = registrations.length > 0
    console.log('SW Registrations:', registrations)
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    console.log('PWA install prompt captured')
  })
  
  console.log('PwaInstallPrompt component mounted')
})

const installPwa = async () => {
  if (debugMode.value && !deferredPrompt.value) {
    alert('Modo debug: Evento de instalação não capturado ainda. \n\nMotivos possíveis:\n1. App já instalado.\n2. Navegador não suporta (Firefox desktop, etc).\n3. Falta de interação com a página.\n4. Não servido via HTTPS (exceto localhost).')
    return
  }

  if (!deferredPrompt.value) return
  
  deferredPrompt.value.prompt()
  
  const { outcome } = await deferredPrompt.value.userChoice
  console.log(`User response to the install prompt: ${outcome}`)
  
  deferredPrompt.value = null
}
</script>
