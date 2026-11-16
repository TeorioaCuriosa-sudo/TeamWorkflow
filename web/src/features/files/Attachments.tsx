// Ficheiros anexados a um projeto, tópico, tarefa ou modelo: enviar (botão ou arrastar), ver, descarregar e apagar.

import type { DragEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, File, FileText, Music, Play, Trash2, Upload, X } from 'lucide-react';
import { del, errorMessage, uploadFile } from '../../api/client';
import type { Attachment, FileOwner } from '../../api/types';
import { cx } from '../../lib/cx';
import { dateLabel } from '../../lib/dates';
import { downloadUrl, extensionOf, fileUrl, formatSize, isViewable } from '../../lib/files';
import { useData, useTeam } from '../../state/data';
import { Button, IconButton, LinkButton } from '../../ui/Button';
import { Modal, useConfirm } from '../../ui/Modal';
import { Progress } from '../../ui/misc';
import { useToast } from '../../ui/Toast';

interface Upload {
  key: number;
  name: string;
  fraction: number;
  error: string;
}

interface AttachmentsProps {
  owner: FileOwner;
  ownerId: number;
  files: Attachment[];
  /** Só ver e descarregar (por exemplo, numa tarefa arquivada). */
  readOnly?: boolean;
  /** Texto de apoio por baixo do botão de enviar. */
  hint?: ReactNode;
  /** Quem vê pode remover qualquer ficheiro daqui, e não só os que enviou (o dono da tarefa, por exemplo). */
  manage?: boolean;
}

let nextKey = 1;

export function Attachments({ owner, ownerId, files, readOnly, hint, manage }: AttachmentsProps) {
  const { data, refresh } = useData();
  const team = useTeam();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const maxMb = data.limits.max_upload_mb;
  const viewable = files.filter((f) => isViewable(f.kind));
  const busy = uploads.some((u) => !u.error);

  const patchUpload = (key: number, change: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));
  const dropUpload = (key: number) => setUploads((list) => list.filter((u) => u.key !== key));

  async function send(picked: File[]) {
    if (!picked.length) return;
    const items = picked.map((file) => ({ file, key: nextKey++ }));
    setUploads((list) => [...list, ...items.map(({ file, key }) => ({ key, name: file.name, fraction: 0, error: '' }))]);
    let sent = 0;
    // Um de cada vez: poupa o servidor e a ligação, e a barra de cada ficheiro é a sua.
    for (const { file, key } of items) {
      if (file.size > maxMb * 1048576) {
        patchUpload(key, { error: `Tem ${formatSize(file.size)} e o limite é ${maxMb} MB.` });
        continue;
      }
      if (file.size === 0) {
        patchUpload(key, { error: 'O ficheiro está vazio.' });
        continue;
      }
      try {
        await uploadFile(owner, ownerId, file, (fraction) => patchUpload(key, { fraction }));
        dropUpload(key);
        sent += 1;
        await refresh();
      } catch (e) {
        patchUpload(key, { error: errorMessage(e) });
      }
    }
    if (sent) toast.success(sent === 1 ? 'Ficheiro anexado.' : `${sent} ficheiros anexados.`);
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setOver(false);
    if (readOnly) return;
    void send([...e.dataTransfer.files]);
  }

  async function remove(f: Attachment) {
    if (!(await confirm({ title: 'Apagar ficheiro?', message: `“${f.name}” é apagado para todos. Não dá para desfazer.`, confirmLabel: 'Apagar', tone: 'danger' }))) return;
    try {
      await del(`/api/files/${f.id}`);
      toast.success('Ficheiro apagado.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
    await refresh();
  }

  const mayDelete = (f: Attachment) => f.uploaded_by === team.me.id || team.can.manage_files || !!manage;
  const current = viewing === null ? null : viewable.findIndex((f) => f.id === viewing);

  return (
    <div className="grid gap-3">
      {!readOnly && (
        <div
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
          onDrop={onDrop}
          className={cx(
            'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed px-4 py-3 transition-colors',
            over ? 'border-ring bg-info-soft/50' : 'border-line-strong bg-surface-2',
          )}
        >
          <Button size="sm" icon={<Upload className="size-4" />} loading={busy} onClick={() => input.current?.click()}>Anexar ficheiros</Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            data-testid="file-input"
            aria-label="Escolher ficheiros para anexar"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = '';
              void send(picked);
            }}
          />
          <p className="min-w-0 flex-1 basis-56 text-xs text-ink-3">
            {hint ?? 'Documentos, imagens, vídeos, o que for preciso.'} Arrasta para aqui ou escolhe no computador. Até {maxMb} MB cada.
          </p>
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="grid gap-2" aria-label="Envios em curso">
          {uploads.map((u) => (
            <li key={u.key} className={cx('rounded-lg border px-3 py-2 text-[13px]', u.error ? 'border-danger/40 bg-danger-soft' : 'border-line bg-surface')}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{u.name}</span>
                {u.error ? (
                  <IconButton label={`Dispensar o aviso de ${u.name}`} size="sm" onClick={() => dropUpload(u.key)}><X className="size-4" /></IconButton>
                ) : (
                  <span className="num text-xs text-ink-3">{Math.round(u.fraction * 100)}%</span>
                )}
              </div>
              {u.error ? <p role="alert" className="mt-0.5 text-danger">{u.error}</p> : <Progress value={Math.round(u.fraction * 100)} max={100} className="mt-1.5" />}
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 && !uploads.length && <p className="text-[13px] text-ink-3">Ainda não há ficheiros.</p>}

      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {files.map((f) => (
            <li key={f.id} data-file-id={f.id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <Preview file={f} onView={() => setViewing(f.id)} />
              <div className="grid gap-0.5 px-2.5 pt-2 pb-1">
                <p className="truncate text-[13px] font-medium text-ink" title={f.name}>{f.name}</p>
                <p className="num truncate text-xs text-ink-3">{formatSize(f.size)} · {dateLabel(f.created_at)}</p>
                <p className="truncate text-xs text-ink-3">por {team.nameOf(f.uploaded_by)}</p>
              </div>
              <div className="mt-auto flex items-center justify-end gap-0.5 px-1.5 pb-1.5">
                <a
                  href={downloadUrl(f.id)}
                  aria-label={`Descarregar ${f.name}`}
                  title="Descarregar"
                  className="inline-flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <Download className="size-4" />
                </a>
                {mayDelete(f) && !readOnly && (
                  <IconButton label={`Apagar ${f.name}`} size="sm" onClick={() => void remove(f)}><Trash2 className="size-4" /></IconButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {current !== null && current >= 0 && (
        <Lightbox
          files={viewable}
          index={current}
          onIndex={(i) => setViewing(viewable[i]!.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

const TILE = 'relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-surface-3 text-ink-3';

/** A miniatura (ou o ícone) de um ficheiro. Clicar abre-o. */
function Preview({ file: f, onView }: { file: Attachment; onView: () => void }) {
  if (f.kind === 'image') {
    return (
      <button type="button" onClick={onView} aria-label={`Ver ${f.name}`} className={cx(TILE, 'cursor-zoom-in')}>
        <img src={fileUrl(f.id)} alt="" loading="lazy" className="size-full object-cover" />
      </button>
    );
  }
  if (f.kind === 'video') {
    return (
      <button type="button" onClick={onView} aria-label={`Ver ${f.name}`} className={TILE}>
        <video src={`${fileUrl(f.id)}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} className="size-full object-cover" />
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/20">
          <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white"><Play className="size-5 fill-current" /></span>
        </span>
      </button>
    );
  }
  if (f.kind === 'audio') {
    return (
      <button type="button" onClick={onView} aria-label={`Ouvir ${f.name}`} className={TILE}>
        <Music className="size-8" aria-hidden />
      </button>
    );
  }
  // PDF e texto abrem noutro separador; o resto descarrega.
  const opens = f.kind === 'pdf' || f.kind === 'text';
  return (
    <a
      href={opens ? fileUrl(f.id) : downloadUrl(f.id)}
      {...(opens ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      // Num ficheiro que só descarrega, o ícone repete o botão de descarregar: fica fora do teclado e dos leitores de ecrã.
      {...(opens ? { 'aria-label': `Abrir ${f.name} num separador novo` } : { 'aria-hidden': true, tabIndex: -1 })}
      className={cx(TILE, 'content-center justify-items-center gap-1')}
    >
      {opens ? <FileText className="size-8" aria-hidden /> : <File className="size-8" aria-hidden />}
      <span className="num rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 ring-1 ring-line">{extensionOf(f.name)}</span>
    </a>
  );
}

function Lightbox({ files, index, onIndex, onClose }: { files: Attachment[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const f = files[index]!;
  const many = files.length > 1;
  return (
    <Modal
      size="xl"
      title={<span className="break-all">{f.name}</span>}
      subtitle={`${formatSize(f.size)}${many ? ` · ${index + 1} de ${files.length}` : ''}`}
      onClose={onClose}
      footer={
        <>
          {many && (
            <>
              <IconButton label="Anterior" variant="secondary" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft className="size-4" /></IconButton>
              <IconButton label="Seguinte" variant="secondary" disabled={index === files.length - 1} onClick={() => onIndex(index + 1)}><ChevronRight className="size-4" /></IconButton>
            </>
          )}
          <span className="flex-1" />
          <LinkButton href={downloadUrl(f.id)} icon={<Download className="size-4" />}>Descarregar</LinkButton>
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <div className="grid min-h-48 place-items-center">
        {f.kind === 'image' && <img key={f.id} src={fileUrl(f.id)} alt={f.name} className="max-h-[68dvh] max-w-full rounded-lg object-contain" />}
        {f.kind === 'video' && <video key={f.id} src={fileUrl(f.id)} controls autoPlay playsInline className="max-h-[68dvh] max-w-full rounded-lg bg-black" />}
        {f.kind === 'audio' && <audio key={f.id} src={fileUrl(f.id)} controls autoPlay className="w-full max-w-md" />}
      </div>
    </Modal>
  );
}
