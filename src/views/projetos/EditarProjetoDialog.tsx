'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { projectAPI } from '@/src/views/projetos/clienteProjetos';
import { erroNomeProjeto } from '@/src/views/projetos/regrasProjeto';
import { SeletorCor } from '@/src/views/projetos/SeletorCor';
import type { Project } from '@/types/index';

interface Props {
  /** Projeto em edição; null = janela fechada. */
  projeto: Project | null;
  onFechar: () => void;
  /** Chamado com o projeto já alterado, depois que o servidor salvou. */
  onSalvo: (projeto: Project) => void;
}

/** Janela "Editar projeto": Enter salva, Esc fecha e o erro aparece na tela. */
export function EditarProjetoDialog({ projeto, onFechar, onSalvo }: Props) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('#6366f1');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Ao abrir com outro projeto, carrega os dados dele.
  useEffect(() => {
    if (!projeto) return;
    setNome(projeto.name);
    setCor(projeto.color);
    setDescricao(projeto.description ?? '');
    setErro(null);
  }, [projeto]);

  const fechar = (aberto: boolean) => {
    if (!aberto && !salvando) onFechar();
  };

  const salvar = async () => {
    if (!projeto || salvando) return;
    const erroNome = erroNomeProjeto(nome);
    if (erroNome) { setErro(erroNome); return; }

    // Cor só vai se mudou: projeto antigo com cor fora do padrão ainda consegue salvar o nome.
    const alteracao = {
      name: nome.trim(),
      description: descricao.trim() || null,
      ...(cor !== projeto.color ? { color: cor } : {}),
    };
    setSalvando(true);
    setErro(null);
    const { success, error } = await projectAPI.updateProject(projeto.id, alteracao);
    setSalvando(false);

    if (!success) {
      setErro(error ?? 'Não foi possível salvar o projeto. Tente de novo.');
      return;
    }
    onSalvo({ ...projeto, ...alteracao });
    window.dispatchEvent(new CustomEvent('projects_updated'));
  };

  return (
    <Dialog open={!!projeto} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Nome do projeto</label>
            <Input
              autoFocus
              value={nome}
              onChange={(e) => { setNome(e.target.value); setErro(null); }}
              placeholder="Nome do projeto"
              disabled={salvando}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">Cor</label>
            <SeletorCor valor={cor} onChange={setCor} disabled={salvando} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição do projeto"
              rows={3}
              maxLength={2000}
              disabled={salvando}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <Button type="submit" className="w-full" disabled={salvando || !nome.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
