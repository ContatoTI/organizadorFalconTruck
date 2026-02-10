<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Button from '@/components/ui/button/Button.vue'
import Card from '@/components/ui/card/Card.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardFooter from '@/components/ui/card/CardFooter.vue'

const props = defineProps<{
  isOpen: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
}>()

const emit = defineEmits(['confirm', 'cancel'])

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.isOpen) return
  
  if (e.key === 'Escape') {
    emit('cancel')
  } else if (e.key === 'Enter') {
    e.preventDefault() // Evitar submissão de forms se houver
    emit('confirm')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="$emit('cancel')">
    <Card class="w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200 shadow-xl border-destructive/20">
      <CardHeader>
        <CardTitle>{{ title || 'Confirmar Ação' }}</CardTitle>
        <CardDescription>{{ description || 'Tem certeza que deseja continuar?' }}</CardDescription>
      </CardHeader>
      <CardFooter class="flex justify-end gap-2">
        <Button variant="outline" @click="$emit('cancel')">{{ cancelText || 'Cancelar (Esc)' }}</Button>
        <Button variant="destructive" @click="$emit('confirm')">{{ confirmText || 'Confirmar (Enter)' }}</Button>
      </CardFooter>
    </Card>
  </div>
</template>
