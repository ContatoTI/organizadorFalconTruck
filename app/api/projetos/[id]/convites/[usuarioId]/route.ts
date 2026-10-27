import { convidar, cancelarConvite } from '@/src/controllers/projetos/membros';

type Contexto = { params: Promise<{ id: string; usuarioId: string }> };

export const PUT = async (_req: Request, { params }: Contexto) => {
  const { id, usuarioId } = await params;
  return convidar(id, usuarioId);
};

export const DELETE = async (_req: Request, { params }: Contexto) => {
  const { id, usuarioId } = await params;
  return cancelarConvite(id, usuarioId);
};
