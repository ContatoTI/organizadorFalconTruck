'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomeProjeto: string;
  onConfirmar: () => void;
}

/** Confirma antes de o membro sair do projeto (para voltar, precisa de novo convite). */
export function SairDoProjetoDialog({ open, onOpenChange, nomeProjeto, onConfirmar }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sair do projeto</DialogTitle>
          <DialogDescription>
            Você deixa de ver <strong>{nomeProjeto}</strong>. Para voltar, o dono precisa te convidar de novo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => { onOpenChange(false); onConfirmar(); }}
          >
            Sair
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
