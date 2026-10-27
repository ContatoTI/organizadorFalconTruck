import { listarAvisos, criarAviso } from '@/src/controllers/notificacoes/notificacoes';

export const GET = () => listarAvisos();
export const POST = (req: Request) => criarAviso(req);
