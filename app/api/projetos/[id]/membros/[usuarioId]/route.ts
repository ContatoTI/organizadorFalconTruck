import { removerMembro } from '@/src/controllers/projetos/membros';

type Contexto = { params: Promise<{ id: string; usuarioId: string }> };

export const DELETE = async (_req: Request, { params }: Contexto) => {
  const { id, usuarioId } = await params;
  return removerMembro(id, usuarioId);
};
