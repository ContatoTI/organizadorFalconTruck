import { listarLancamentos, criarLancamento } from '@/src/controllers/financas/lancamentos';

export const GET = () => listarLancamentos();
export const POST = (req: Request) => criarLancamento(req);
