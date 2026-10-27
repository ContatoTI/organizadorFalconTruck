'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HomeDashboard } from '@/src/views/tarefas/home/HomeDashboard';
import { ProjectWorkspace } from '@/src/views/tarefas/ProjectWorkspace';

/**
 * A rota `/` atende duas telas bem diferentes:
 *
 *   /                  → HomeDashboard: capturar rápido e triar (a tela do dia a dia)
 *   /?project=3        → ProjectWorkspace: pastas, kanban, compartilhamento
 *   /?group=12         → ProjectWorkspace: a lista/bloco aberto em tela cheia
 *
 * Separar as duas foi o que permitiu redesenhar a home sem tocar em nada do
 * que já funciona nos projetos.
 */
function HomeRouter() {
  const searchParams = useSearchParams();
  const hasFilter = !!searchParams.get('project') || !!searchParams.get('group');

  return hasFilter ? <ProjectWorkspace /> : <HomeDashboard />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>}>
      <HomeRouter />
    </Suspense>
  );
}
