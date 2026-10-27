import { vincularGrupo, desvincularGrupo } from '@/src/controllers/tarefas/tarefas';

type Contexto = { params: Promise<{ id: string; grupoId: string }> };

export const PUT = async (_req: Request, { params }: Contexto) => {
  const { id, grupoId } = await params;
  return vincularGrupo(id, grupoId);
};

export const DELETE = async (req: Request, { params }: Contexto) => {
  const { id, grupoId } = await params;
  return desvincularGrupo(req, id, grupoId);
};
