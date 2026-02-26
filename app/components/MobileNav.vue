<template>
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex justify-around items-center h-16 pb-safe">
    <NuxtLink 
      to="/" 
      class="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors gap-1"
      active-class="text-primary"
    >
      <LayoutDashboard class="w-5 h-5" />
      <span class="text-[10px] font-medium">Início</span>
    </NuxtLink>

    <NuxtLink 
      to="/calendar" 
      class="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors gap-1"
      active-class="text-primary"
    >
      <Calendar class="w-5 h-5" />
      <span class="text-[10px] font-medium">Agenda</span>
    </NuxtLink>

    <div class="relative -top-5">
      <NuxtLink 
        to="/groups?action=create&type=time" 
        class="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-transform active:scale-95"
      >
        <Plus class="w-6 h-6" />
      </NuxtLink>
    </div>

    <NuxtLink 
      to="/groups" 
      class="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors gap-1"
      active-class="text-primary"
    >
      <List class="w-5 h-5" />
      <span class="text-[10px] font-medium">Grupos</span>
    </NuxtLink>

    <NuxtLink 
      to="/finances" 
      class="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors gap-1"
      active-class="text-primary"
    >
      <Wallet class="w-5 h-5" />
      <span class="text-[10px] font-medium">Finanças</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { LayoutDashboard, Calendar, Plus, List, Wallet } from 'lucide-vue-next'
</script>

<style scoped>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
