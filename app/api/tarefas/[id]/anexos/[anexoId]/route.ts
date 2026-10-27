import { verAnexo, excluirAnexo } from '@/src/controllers/tarefas/anexos';

type Contexto = { params: Promise<{ id: string; anexoId: string }> };

export const GET = async (_req: Request, { params }: Contexto) => {
  const { id, anexoId } = await params;
  return verAnexo(id, anexoId);
};

export const DELETE = async (_req: Request, { params }: Contexto) => {
  const { id, anexoId } = await params;
  return excluirAnexo(id, anexoId);
};
