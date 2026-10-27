import { listarProjetos, criarProjeto } from '@/src/controllers/projetos/projetos';

export const GET = (req: Request) => listarProjetos(req);
export const POST = (req: Request) => criarProjeto(req);
