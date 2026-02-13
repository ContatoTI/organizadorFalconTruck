<template>
  <div v-if="deferredPrompt || debugMode" class="fixed bottom-4 right-4 z-50 p-4 bg-background border rounded-lg shadow-lg flex flex-col gap-2">
    <p class="text-sm font-medium">Instalar App Organizador</p>
    <Button @click="installPwa" class="w-full">
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
const debugMode = ref(false) // Mude para true se quiser ver o botão sempre para teste visual

onMounted(() => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    console.log('PWA install prompt captured')
  })
  
  // Debug: log to console to verify component is mounted
  console.log('PwaInstallPrompt component mounted')
})

const installPwa = async () => {
  if (debugMode.value && !deferredPrompt.value) {
    alert('Modo debug: Evento de instalação não capturado ainda. Tente em um dispositivo móvel ou Chrome Desktop.')
    return
  }

  if (!deferredPrompt.value) return
  
  deferredPrompt.value.prompt()
  
  const { outcome } = await deferredPrompt.value.userChoice
  console.log(`User response to the install prompt: ${outcome}`)
  
  deferredPrompt.value = null
}
</script>
