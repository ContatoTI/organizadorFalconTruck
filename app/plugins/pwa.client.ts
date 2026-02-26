export default defineNuxtPlugin(() => {
  if (import.meta.client && 'serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        console.log('SW registered manually via plugin: ', registration)
      } catch (error) {
        console.error('SW registration failed manually: ', error)
      }
    })
  }
})
