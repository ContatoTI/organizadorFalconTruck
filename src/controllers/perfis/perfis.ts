import * as perfis from '@/src/models/perfis/perfis';
import { exigirLogin, tratar } from '../sessao';

/** GET /api/perfis?ids=a,b&excluirEu=1&limite=50 */
export function listarPerfis(request: Request) {
  return tratar('carregar as pessoas', async () => {
    const parametros = new URL(request.url).searchParams;
    const ids = perfis.lerIds(parametros.get('ids'));
    const limite = perfis.lerLimite(parametros.get('limite'));
    const sessao = await exigirLogin();
    if (sessao instanceof Response) return sessao;
    const excluirId = parametros.get('excluirEu') === '1' ? sessao.usuario.id : undefined;
    return Response.json(await perfis.listar(sessao.db, { ids, excluirId, limite }));
  });
}
