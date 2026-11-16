// Ficheiros anexados a projetos, tópicos, modelos de tarefa e tarefas.
// Os dados ficam na tabela `attachments`; os ficheiros em disco (pasta uploads, ao lado da base de dados), com nomes
// aleatórios, por isso o nome que a pessoa escolheu nunca toca no sistema de ficheiros.
//
// Quem pode o quê: todos veem e descarregam; todos enviam; apaga quem enviou, um comandante ou um administrador.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tx } from './db.js';
import { logEvent } from './notify.js';
import { isCommander } from './perms.js';
import { bad, forbidden, HttpError, notFound, oneOf } from './validate.js';

export const OWNERS = ['project', 'topic', 'task', 'template'];
const OWNER_TABLE = { project: 'projects', topic: 'topics', task: 'tasks', template: 'templates' };
const MAX_PER_OWNER = 100;

// Tipo de conteúdo pela extensão (nunca pelo que o browser diz). O que não está aqui é descarregado como binário.
const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/markdown',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.zip': 'application/zip', '.json': 'application/json',
};
// Só estes abrem diretamente no browser; tudo o resto é sempre descarregado (sobretudo SVG e HTML, que podem trazer scripts).
const INLINE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'application/pdf', 'text/plain',
]);

/** O que a interface mostra: miniatura (image), leitor (video, audio), pré-visualização (pdf, text) ou só ícone (file). */
export function kindOf(mime) {
  if (mime === 'image/svg+xml') return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/plain') return 'text';
  return 'file';
}

export function mimeFor(name) {
  return TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream';
}

/** Nome para mostrar: sem pastas, sem caracteres de controlo, com um tamanho razoável (mantendo a extensão). */
export function cleanName(raw) {
  let s = String(raw ?? '');
  try { s = decodeURIComponent(s); } catch { /* já vinha em texto simples */ }
  s = s.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 150) {
    const ext = path.extname(s).slice(0, 12);
    s = `${s.slice(0, 150 - ext.length)}${ext}`;
  }
  return s && s !== '.' && s !== '..' ? s : 'ficheiro';
}

const present = (r) => ({
  id: r.id, owner_type: r.owner_type, owner_id: r.owner_id, name: r.name, mime: r.mime, kind: kindOf(r.mime),
  size: r.size, uploaded_by: r.uploaded_by, created_at: r.created_at,
});

export function listFor(db, type, ownerId) {
  return db.prepare('SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id').all(type, ownerId).map(present);
}

/** Os ficheiros de projetos, tópicos e modelos (as tarefas carregam os seus à parte, ao abrir). */
export function listLibrary(db) {
  return db.prepare(`SELECT * FROM attachments WHERE owner_type != 'task' ORDER BY id`).all().map(present);
}

function ownerOrThrow(db, type, ownerId) {
  oneOf(type, OWNERS, 'Tipo de dono');
  const row = db.prepare(`SELECT id${type === 'task' ? ', title, member_id' : ''} FROM ${OWNER_TABLE[type]} WHERE id = ?`).get(ownerId);
  if (!row) throw notFound('O destino do ficheiro já não existe.');
  return row;
}

const filePath = (dir, stored) => path.join(dir, stored);
const unlinkQuiet = (file) => { try { fs.rmSync(file, { force: true }); } catch { /* já não existe */ } };

/**
 * Guarda o corpo do pedido como ficheiro. Lê em fluxo (nunca o ficheiro inteiro em memória) e recusa o que passa do limite.
 * Se o limite for ultrapassado, o resto do envio é lido e deitado fora para o browser poder receber a mensagem de erro.
 */
export async function saveUpload(db, dir, req, { type, ownerId, name, maxBytes, actor, nowIso, fx }) {
  const owner = ownerOrThrow(db, type, ownerId);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE owner_type = ? AND owner_id = ?').get(type, ownerId);
  if (n >= MAX_PER_OWNER) throw bad(`Há ficheiros a mais aqui (máximo ${MAX_PER_OWNER}). Apaga alguns antes de enviar mais.`);

  const display = cleanName(name);
  const stored = crypto.randomBytes(16).toString('hex');
  const tmp = filePath(dir, `${stored}.part`);
  fs.mkdirSync(dir, { recursive: true });

  let size = 0;
  let tooBig = false;
  const gauge = new Transform({
    transform(chunk, _enc, done) {
      size += chunk.length;
      if (size > maxBytes) {
        tooBig = true;
        if (size > maxBytes * 3) return done(new HttpError(413, 'Ficheiro demasiado grande.'));
        return done(); // deita fora
      }
      return done(null, chunk);
    },
  });

  try {
    await pipeline(req, gauge, fs.createWriteStream(tmp));
  } catch (err) {
    unlinkQuiet(tmp);
    throw err instanceof HttpError ? err : bad('O envio foi interrompido. Tenta outra vez.');
  }
  if (tooBig) {
    unlinkQuiet(tmp);
    throw new HttpError(413, `O ficheiro é maior do que o limite de ${Math.round((maxBytes / 1048576) * 10) / 10} MB.`);
  }
  if (!size) {
    unlinkQuiet(tmp);
    throw bad('O ficheiro está vazio.');
  }

  try {
    fs.renameSync(tmp, filePath(dir, stored));
    const row = tx(db, () => {
      const res = db
        .prepare('INSERT INTO attachments (owner_type, owner_id, name, mime, size, stored_name, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(type, ownerId, display, mimeFor(display), size, stored, actor.id, nowIso);
      const aid = Number(res.lastInsertRowid);
      if (type === 'task') {
        // Fica na linha do tempo da tarefa, e quem a tem é avisado (a não ser que tenha sido ela a anexar).
        logEvent(db, { task_id: ownerId, member_id: actor.id, type: 'comment', text: `Anexou “${display}”.`, meta: { attachment_id: aid }, nowIso });
        fx?.notify({
          to: owner.member_id, actor: actor.id, type: 'comment', task_id: ownerId,
          text: `${actor.name} anexou “${display}” em “${owner.title}”.`,
          mail: { kind: 'update', subject: `Novo ficheiro: ${owner.title}`, lines: [`${actor.name} anexou o ficheiro “${display}” à tarefa “${owner.title}”.`] },
        });
      }
      return db.prepare('SELECT * FROM attachments WHERE id = ?').get(aid);
    });
    return present(row);
  } catch (err) {
    unlinkQuiet(filePath(dir, stored));
    throw err;
  }
}

/** Copia os ficheiros de um dono para outro (por exemplo, de um modelo para a tarefa criada a partir dele). */
export function copyAll(db, dir, from, to, { actor, nowIso }) {
  const rows = db.prepare('SELECT * FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id').all(from.type, from.id);
  for (const r of rows) {
    const stored = crypto.randomBytes(16).toString('hex');
    try {
      fs.copyFileSync(filePath(dir, r.stored_name), filePath(dir, stored));
    } catch {
      continue; // o original perdeu-se no disco: copiar o resto
    }
    db.prepare('INSERT INTO attachments (owner_type, owner_id, name, mime, size, stored_name, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(to.type, to.id, r.name, r.mime, r.size, stored, actor?.id ?? r.uploaded_by, nowIso);
  }
  return rows.length;
}

export function removeFile(db, dir, aid, { actor }) {
  const r = db.prepare('SELECT * FROM attachments WHERE id = ?').get(aid);
  if (!r) throw notFound('Ficheiro não encontrado.');
  // Numa tarefa, quem a tem também remove os ficheiros (é quem a gere), mesmo que os tenha anexado outra pessoa.
  const task = r.owner_type === 'task' ? db.prepare('SELECT member_id FROM tasks WHERE id = ?').get(r.owner_id) : null;
  if (r.uploaded_by !== actor.id && task?.member_id !== actor.id && !isCommander(actor)) {
    throw forbidden(task
      ? 'Só quem enviou o ficheiro, quem tem a tarefa, os comandantes e os administradores o podem apagar.'
      : 'Só quem enviou o ficheiro, os comandantes e os administradores o podem apagar.');
  }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(aid);
  unlinkQuiet(filePath(dir, r.stored_name));
}

/**
 * Apaga os ficheiros cujo dono já não existe (projeto, tópico, modelo ou tarefa apagados) e os ficheiros de disco
 * sem registo com mais de uma hora (envios que falharam). Corre depois de cada apagamento e periodicamente.
 */
export function purgeOrphans(db, dir, nowMs = Date.now()) {
  const clauses = OWNERS.map((t) => `(owner_type = '${t}' AND NOT EXISTS (SELECT 1 FROM ${OWNER_TABLE[t]} o WHERE o.id = a.owner_id))`).join(' OR ');
  const gone = db.prepare(`SELECT id, stored_name FROM attachments a WHERE ${clauses}`).all();
  for (const r of gone) {
    db.prepare('DELETE FROM attachments WHERE id = ?').run(r.id);
    unlinkQuiet(filePath(dir, r.stored_name));
  }
  if (!fs.existsSync(dir)) return gone.length;
  const known = new Set(db.prepare('SELECT stored_name FROM attachments').all().map((r) => r.stored_name));
  for (const f of fs.readdirSync(dir)) {
    const base = f.replace(/\.part$/, '');
    if (!/^[0-9a-f]{32}$/.test(base) || (known.has(f) && f === base)) continue;
    const file = filePath(dir, f);
    try {
      if (nowMs - fs.statSync(file).mtimeMs > 3600_000) unlinkQuiet(file);
    } catch { /* desapareceu entretanto */ }
  }
  return gone.length;
}

const asciiName = (s) => s.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

/** Entrega o ficheiro (com suporte a Range, que o Safari e o Chrome exigem para o vídeo avançar e recuar). */
export function sendFile(req, res, db, dir, aid, { download = false } = {}) {
  const r = db.prepare('SELECT * FROM attachments WHERE id = ?').get(aid);
  if (!r) throw notFound('Ficheiro não encontrado.');
  const file = filePath(dir, r.stored_name);
  let stat;
  try { stat = fs.statSync(file); } catch { throw notFound('O ficheiro já não está no servidor.'); }

  const inline = INLINE.has(r.mime) && !download;
  const headers = {
    'Content-Type': r.mime === 'text/plain' ? 'text/plain; charset=utf-8' : r.mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName(r.name)}"; filename*=UTF-8''${encodeURIComponent(r.name)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400',
  };
  // Tudo o que não é PDF fica fechado numa "caixa": mesmo que alguém abra o endereço do ficheiro, nada corre.
  if (r.mime !== 'application/pdf') headers['Content-Security-Policy'] = "default-src 'none'; sandbox";

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else {
      start = Math.max(0, stat.size - Number(range[2])); // "os últimos N bytes"
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
  return undefined;
}
