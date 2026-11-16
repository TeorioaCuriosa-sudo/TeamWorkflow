// Pequenas ajudas para os ficheiros anexados.

import type { Attachment, FileKind } from '../api/types';

/** "1,4 MB", "820 KB": o tamanho de um ficheiro para ler à primeira vista. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0).replace('.', ',')} MB`;
  return `${(bytes / 1073741824).toFixed(1).replace('.', ',')} GB`;
}

/** O endereço para ver o ficheiro (imagem, vídeo, PDF abrem no próprio browser; o resto descarrega). */
export const fileUrl = (id: number) => `/api/files/${id}`;
/** O endereço que obriga a descarregar. */
export const downloadUrl = (id: number) => `/api/files/${id}?download=1`;

/** A extensão em maiúsculas, para o ícone de um ficheiro sem pré-visualização ("PDF", "ZIP"). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1, dot + 6).toUpperCase() : 'FICHEIRO';
}

/** Os que se vêem numa janela por cima da página (imagem, vídeo, áudio). */
export const isViewable = (kind: FileKind) => kind === 'image' || kind === 'video' || kind === 'audio';

export const filesOf = (all: Attachment[], owner: Attachment['owner_type'], id: number) =>
  all.filter((f) => f.owner_type === owner && f.owner_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
