import { listarHabitos, criarHabito } from '@/src/controllers/habitos/habitos';

export const GET = () => listarHabitos();
export const POST = (req: Request) => criarHabito(req);
