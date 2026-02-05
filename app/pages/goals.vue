<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold">Minhas Metas</h1>
      <Button>
        <Plus class="w-4 h-4 mr-2" />
        Nova Meta
      </Button>
    </div>
    
    <!-- Lista de Metas (Placeholder) -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Exemplo de Meta</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground">Descrição da meta aqui...</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Card from '@/components/ui/card/Card.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
</script>