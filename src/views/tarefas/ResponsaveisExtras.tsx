'use client';

/**
 * "Também responsáveis": outras pessoas na mesma tarefa, além do principal.
 * Dono do projeto adiciona e tira; os demais só veem os nomes.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { chamarApi } from '@/src/lib/chamarApi';
import { useToast } from '@/src/components/Toast';
import { vagasDeExtras, type ResponsavelExtra } from '@/src/models/tarefas/responsaveis';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Candidato { user_id: string; full_name?: string; email?: string }

interface ResponsaveisExtrasProps {
  tarefaId: number;
  principalId: string | null;
  podeEditar: boolean;
  candidatos: Candidato[];
}

const url = (tarefaId: number) => `/api/tarefas/${tarefaId}/responsaveis`;

export function ResponsaveisExtras({ tarefaId, principalId, podeEditar, candidatos }: ResponsaveisExtrasProps) {
  const [lista, setLista] = useState<ResponsavelExtra[]>([]);
  const [salvando, setSalvando] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let ativo = true;
    chamarApi<ResponsavelExtra[]>(url(tarefaId))
      .then(dados => { if (ativo) setLista(dados); })
      .catch(() => { if (ativo) setLista([]); });
    return () => { ativo = false; };
  }, [tarefaId]);

  const salvar = async (ids: string[]) => {
    setSalvando(true);
    try {
      setLista(await chamarApi<ResponsavelExtra[]>(url(tarefaId), { method: 'PUT', json: { usuarioIds: ids } }));
    } catch (e) {
      toast((e as Error).message || 'Não foi possível salvar os responsáveis.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const idsAtuais = lista.map(r => r.usuario_id);
  const disponiveis = candidatos.filter(c => c.user_id !== principalId && !idsAtuais.includes(c.user_id));

  const temVaga = lista.length < vagasDeExtras(!!principalId);

  if (!podeEditar && lista.length === 0) return null;

  return (
    <div className="col-span-2">
      <label className="text-sm text-muted-foreground block mb-1">Também responsáveis</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {lista.map(r => (
          <span key={r.usuario_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
            {r.nome}
            {podeEditar && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => salvar(idsAtuais.filter(id => id !== r.usuario_id))}
                className="rounded-full p-0.5 hover:bg-accent disabled:opacity-50"
                title={`Tirar ${r.nome}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {podeEditar && temVaga && disponiveis.length > 0 && (
          <Select value="" onValueChange={(id: string | null) => { if (id) salvar([...idsAtuais, id]); }} disabled={salvando}>
            <SelectTrigger className="h-7 w-auto text-xs">
              <SelectValue placeholder="+ Adicionar pessoa" />
            </SelectTrigger>
            <SelectContent side="bottom" align="start" className="bg-popover border border-border shadow-lg z-[100]">
              {disponiveis.map(c => (
                <SelectItem key={c.user_id} value={c.user_id}>
                  {c.full_name || c.email || 'Usuário'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
