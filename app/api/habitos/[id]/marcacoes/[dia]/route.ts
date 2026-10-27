import { marcarDia, desmarcarDia } from '@/src/controllers/habitos/habitos';

type Contexto = { params: Promise<{ id: string; dia: string }> };

export const PUT = async (_req: Request, { params }: Contexto) => {
  const { id, dia } = await params;
  return marcarDia(id, dia);
};

export const DELETE = async (_req: Request, { params }: Contexto) => {
  const { id, dia } = await params;
  return desmarcarDia(id, dia);
};
