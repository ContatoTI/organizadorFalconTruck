<template>
  <div>
    <VitePwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
      <PwaInstallPrompt />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { provide, onMounted } from 'vue'

const deferredPrompt = useState<any>('pwa-deferred-prompt', () => null)

onMounted(() => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    console.log('App.vue: PWA install prompt captured globally')
  })
})
</script>
