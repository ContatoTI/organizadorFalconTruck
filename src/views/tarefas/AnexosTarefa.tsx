'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Trash2, Upload, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/src/components/Toast';
import { cn } from '@/src/lib/utils';
import { useColarArrastarArquivos, type OrigemArquivos } from '@/src/hooks/useColarArrastarArquivos';
import { CONFIG_ANEXOS } from '@/src/models/tarefas/configAnexos';
import { validarArquivo, nomeColado, type Anexo } from '@/src/models/tarefas/anexos';

interface Envio {
  chave: string;
  nome: string;
  progresso: number;
  erro?: string;
}

interface AnexosTarefaProps {
  tarefaId: number;
  /** Campo(s) onde o Ctrl+V e o arrastar também anexam (ex.: descrição). */
  children?: ReactNode;
}

const urlAnexos = (tarefaId: number) => `/api/tarefas/${tarefaId}/anexos`;

/** XHR em vez de fetch para ter progresso do upload. */
function enviarComProgresso(tarefaId: number, arquivo: File, aoProgredir: (pct: number) => void): Promise<Anexo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', urlAnexos(tarefaId));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status === 201 ? resolve(xhr.response) : reject(new Error(xhr.response?.erro ?? 'Falha no envio.')));
    xhr.onerror = () => reject(new Error('Sem conexão.'));
    const form = new FormData();
    form.set('arquivo', arquivo);
    xhr.send(form);
  });
}

export function AnexosTarefa({ tarefaId, children }: AnexosTarefaProps) {
  const { toast } = useToast();
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [aberto, setAberto] = useState<Anexo | null>(null);
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;
    fetch(urlAnexos(tarefaId))
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).erro))))
      .then((lista: Anexo[]) => ativo && setAnexos(lista))
      .catch((e: Error) => ativo && toast(e.message || 'Erro ao carregar anexos.', 'error'));
    return () => { ativo = false; };
  }, [tarefaId, toast]);

  const atualizarEnvio = (chave: string, dados: Partial<Envio>) =>
    setEnvios((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...dados } : e)));

  const receber = useCallback((arquivos: File[], origem: OrigemArquivos) => {
    // Cada arquivo segue sozinho: um erro não derruba os outros.
    for (const original of arquivos) {
      const arquivo = origem === 'colado'
        ? new File([original], nomeColado(original.type), { type: original.type })
        : original;
      const chave = crypto.randomUUID();
      const invalido = validarArquivo({ nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
      setEnvios((lista) => [...lista, { chave, nome: arquivo.name, progresso: 0, erro: invalido ?? undefined }]);
      if (invalido) continue;

      enviarComProgresso(tarefaId, arquivo, (pct) => atualizarEnvio(chave, { progresso: pct }))
        .then((anexo) => {
          setAnexos((lista) => [...lista, anexo]);
          setEnvios((lista) => lista.filter((e) => e.chave !== chave));
        })
        .catch((e: Error) => atualizarEnvio(chave, { erro: e.message }));
    }
  }, [tarefaId]);

  const { arrastando, propsArea } = useColarArrastarArquivos(receber);

  const excluir = async (anexo: Anexo) => {
    if (!confirm(`Excluir o anexo "${anexo.nome}"?`)) return;
    const r = await fetch(`${urlAnexos(tarefaId)}/${anexo.id}`, { method: 'DELETE' });
    if (!r.ok) {
      toast((await r.json().catch(() => null))?.erro ?? 'Erro ao excluir o anexo.', 'error');
      return;
    }
    setAnexos((lista) => lista.filter((a) => a.id !== anexo.id));
    setAberto(null);
  };

  return (
    <div {...propsArea} className="relative space-y-3">
      {children}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Anexos</span>
        <Button type="button" variant="outline" size="sm" onClick={() => seletor.current?.click()}>
          <ImagePlus /> Anexar
        </Button>
        <input
          ref={seletor}
          type="file"
          multiple
          accept={CONFIG_ANEXOS.tiposAceitos.join(',')}
          className="hidden"
          onChange={(e) => {
            receber(Array.from(e.target.files ?? []), 'solto');
            e.target.value = '';
          }}
        />
      </div>

      {anexos.length === 0 && envios.length === 0 && (
        <p className="text-xs text-muted-foreground">Cole um print (Ctrl+V), arraste imagens ou use o botão Anexar.</p>
      )}

      {envios.length > 0 && (
        <ul className="space-y-2">
          {envios.map((e) => (
            <li key={e.chave} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{e.nome}</span>
                {e.erro && (
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Dispensar"
                    onClick={() => setEnvios((l) => l.filter((x) => x.chave !== e.chave))}>×</Button>
                )}
              </div>
              {e.erro
                ? <p className="flex items-center gap-1 text-destructive"><AlertCircle className="size-3" /> {e.erro}</p>
                : <Progress value={e.progresso} />}
            </li>
          ))}
        </ul>
      )}

      {anexos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {anexos.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.nome}
              onClick={() => setAberto(a)}
              className="aspect-square overflow-hidden rounded-lg border border-input bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem vem do nosso proxy autenticado */}
              <img src={`${urlAnexos(tarefaId)}/${a.id}`} alt={a.nome} loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {arrastando && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
          <Upload className="size-4" /> Solte para anexar
        </div>
      )}

      <Dialog open={aberto !== null} onOpenChange={(abrir) => !abrir && setAberto(null)}>
        <DialogContent className="sm:max-w-4xl">
          {aberto && (
            <>
              <DialogTitle className="truncate pr-8">{aberto.nome}</DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem vem do nosso proxy autenticado */}
              <img src={`${urlAnexos(tarefaId)}/${aberto.id}`} alt={aberto.nome} className="max-h-[75vh] w-full object-contain" />
              <div className="flex justify-end">
                <Button type="button" variant="destructive" size="sm" onClick={() => excluir(aberto)}>
                  <Trash2 /> Excluir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
