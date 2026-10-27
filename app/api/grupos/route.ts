import { listarGrupos, criarGrupo } from '@/src/controllers/grupos/grupos';

export const GET = (req: Request) => listarGrupos(req);
export const POST = (req: Request) => criarGrupo(req);
