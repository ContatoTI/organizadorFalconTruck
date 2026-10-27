import { darAcesso, removerAcesso } from '@/src/controllers/compartilhamentos/compartilhamentos';

type Contexto = { params: Promise<{ tipo: string; id: string; usuarioId: string }> };

export const PUT = async (_req: Request, { params }: Contexto) => {
  const { tipo, id, usuarioId } = await params;
  return darAcesso(tipo, id, usuarioId);
};

export const DELETE = async (_req: Request, { params }: Contexto) => {
  const { tipo, id, usuarioId } = await params;
  return removerAcesso(tipo, id, usuarioId);
};
