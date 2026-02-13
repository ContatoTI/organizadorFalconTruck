<script setup lang="ts">
import { X, Undo2 } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'

defineProps<{
  show: boolean
  message: string
}>()

const emit = defineEmits(['close', 'undo'])
</script>

<template>
  <Transition
    enter-active-class="transform ease-out duration-300 transition"
    enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
    enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
    leave-active-class="transition ease-in duration-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="show" class="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex items-center justify-between gap-4 p-4 bg-slate-900 text-white rounded-lg shadow-lg border border-slate-800">
      <div class="flex-1 text-sm font-medium truncate">{{ message }}</div>
      <div class="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" class="h-7 px-3 text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100" @click="$emit('undo')">
          <Undo2 class="w-3.5 h-3.5 mr-1.5" />
          Desfazer
        </Button>
        <button class="p-1 rounded-full hover:bg-slate-800 transition-colors" @click="$emit('close')">
          <X class="w-4 h-4 opacity-70" />
        </button>
      </div>
    </div>
  </Transition>
</template>
