'use client';

import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';

export type OrigemArquivos = 'colado' | 'solto';

type DadosTransferidos = { files: ArrayLike<File>; types: readonly string[] };

/**
 * Arquivos de um Ctrl+V. Se também houver texto (ex.: células do Excel),
 * devolve vazio para o colar de texto seguir normal.
 */
export function arquivosDoColar(dados: DadosTransferidos): File[] {
  if (dados.types.includes('text/plain')) return [];
  return Array.from(dados.files);
}

const temArquivos = (dados: DadosTransferidos) => dados.types.includes('Files');

/** Colar (Ctrl+V) e arrastar/soltar arquivos numa área. Espalhe `propsArea` no elemento. */
export function useColarArrastarArquivos(aoReceber: (arquivos: File[], origem: OrigemArquivos) => void) {
  const [arrastando, setArrastando] = useState(false);
  // dragenter/dragleave disparam a cada filho; o contador evita piscar.
  const profundidade = useRef(0);

  const propsArea = {
    onDragEnter(e: DragEvent) {
      if (!temArquivos(e.dataTransfer)) return;
      e.preventDefault();
      profundidade.current += 1;
      setArrastando(true);
    },
    onDragOver(e: DragEvent) {
      if (temArquivos(e.dataTransfer)) e.preventDefault();
    },
    onDragLeave(e: DragEvent) {
      if (!temArquivos(e.dataTransfer)) return;
      profundidade.current = Math.max(0, profundidade.current - 1);
      if (profundidade.current === 0) setArrastando(false);
    },
    onDrop(e: DragEvent) {
      if (!temArquivos(e.dataTransfer)) return;
      e.preventDefault();
      profundidade.current = 0;
      setArrastando(false);
      const arquivos = Array.from(e.dataTransfer.files);
      if (arquivos.length) aoReceber(arquivos, 'solto');
    },
    onPaste(e: ClipboardEvent) {
      const arquivos = arquivosDoColar(e.clipboardData);
      if (!arquivos.length) return;
      e.preventDefault();
      aoReceber(arquivos, 'colado');
    },
  };

  return { arrastando, propsArea };
}
