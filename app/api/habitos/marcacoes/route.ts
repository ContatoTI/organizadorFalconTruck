import { listarMarcacoes } from '@/src/controllers/habitos/habitos';

export const GET = (req: Request) => listarMarcacoes(req);
