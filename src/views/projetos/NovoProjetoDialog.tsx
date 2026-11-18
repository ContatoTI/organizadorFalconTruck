'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn, PROJECT_COLORS } from '@/src/lib/utils';
import { projectAPI } from '@/src/views/projetos/clienteProjetos';
import { useToast } from '@/src/components/Toast';
import { MODELOS_PASTAS, pastasDoTexto, erroNomeProjeto } from '@/src/views/projetos/regrasProjeto';
import type { Project } from '@/types/index';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado com o projeto criado, antes de abrir a tela dele. */
  onCriado: (projeto: Project) => void;
}

const COR_PADRAO = '#6366f1';

/** Janela "Novo projeto": Enter cria, mostra erro na tela e já abre o projeto criado. */
export function NovoProjetoDialog({ open, onOpenChange, onCriado }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COR_PADRAO);
  const [pastas, setPastas] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const limpar = () => { setNome(''); setCor(COR_PADRAO); setPastas(''); setErro(null); };

  const fechar = (aberto: boolean) => {
    if (salvando) return;
    if (!aberto) limpar();
    onOpenChange(aberto);
  };

  const criar = async () => {
    const erroNome = erroNomeProjeto(nome);
    if (erroNome) { setErro(erroNome); return; }
    setSalvando(true);
    setErro(null);
    const resultado = await projectAPI.createProject(nome.trim(), cor, pastasDoTexto(pastas));
    setSalvando(false);
    if (!resultado.success || !resultado.data) {
      setErro(resultado.error ?? 'Não foi possível criar o projeto. Tente de novo.');
      return;
    }
    onCriado(resultado.data);
    if (resultado.aviso) toast(resultado.aviso, 'error', { duration: 8000 });
    window.dispatchEvent(new CustomEvent('projects_updated'));
    limpar();
    onOpenChange(false);
    router.push(`/?project=${resultado.data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); criar(); }} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Nome do projeto</label>
            <Input
              autoFocus
              value={nome}
              onChange={(e) => { setNome(e.target.value); setErro(null); }}
              placeholder="Ex: Catálogo 2027"
              disabled={salvando}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  onClick={() => setCor(c)}
                  className={cn('w-7 h-7 rounded-full transition-transform', cor === c && 'ring-2 ring-offset-2 ring-primary scale-110')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">Pastas (opcional)</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {MODELOS_PASTAS.map((m) => (
                <button
                  key={m.nome}
                  type="button"
                  onClick={() => setPastas(m.pastas.join('\n'))}
                  className="text-xs px-2 py-1 rounded-full border border-border hover:bg-accent transition-colors"
                  title={m.pastas.join(', ')}
                >
                  {m.nome}
                </button>
              ))}
            </div>
            <textarea
              value={pastas}
              onChange={(e) => setPastas(e.target.value)}
              placeholder={'Uma pasta por linha\nEx: Layout\nFotos\nEtiquetas'}
              rows={3}
              disabled={salvando}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <Button type="submit" className="w-full" disabled={salvando || !nome.trim()}>
            {salvando ? 'Criando…' : 'Criar e abrir projeto'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
