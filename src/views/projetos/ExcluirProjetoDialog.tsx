'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { confirmaExclusao } from '@/src/views/projetos/regrasProjeto';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomeProjeto: string;
  onConfirmar: () => void;
}

/** Excluir projeto só depois de digitar o nome dele — evita apagar sem querer. */
export function ExcluirProjetoDialog({ open, onOpenChange, nomeProjeto, onConfirmar }: Props) {
  const [digitado, setDigitado] = useState('');
  const liberado = confirmaExclusao(nomeProjeto, digitado);

  const fechar = (aberto: boolean) => {
    if (!aberto) setDigitado('');
    onOpenChange(aberto);
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir projeto</DialogTitle>
          <DialogDescription>
            As tarefas de <strong>{nomeProjeto}</strong> voltam para a Caixa de Entrada.
            Digite o nome do projeto para confirmar.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!liberado) return;
            fechar(false);
            onConfirmar();
          }}
          className="space-y-3"
        >
          <Input autoFocus value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={nomeProjeto} />
          <Button type="submit" variant="destructive" className="w-full" disabled={!liberado}>
            Excluir projeto
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
