import { reconvidar } from '@/src/controllers/projetos/membros';

type Contexto = { params: Promise<{ id: string; usuarioId: string }> };

export const POST = async (_req: Request, { params }: Contexto) => {
  const { id, usuarioId } = await params;
  return reconvidar(id, usuarioId);
};
