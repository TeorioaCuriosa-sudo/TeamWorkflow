import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { ExternalLink, Trash2, Video } from 'lucide-react';
import { del, errorMessage, patch, post } from '../../api/client';
import type { Meeting } from '../../api/types';
import { cx, vars } from '../../lib/cx';
import { longDayLabel } from '../../lib/dates';
import { addMinutes, canEditMeeting, providerOf, timeRange } from '../../lib/meetings';
import { linkify } from '../../lib/text';
import { useData, useTeam } from '../../state/data';
import { Avatar } from '../../ui/Avatar';
import { Button, LinkButton } from '../../ui/Button';
import { Field, FieldGroup, Input, Textarea } from '../../ui/Fields';
import { Modal, useConfirm } from '../../ui/Modal';
import { FormError } from '../../ui/misc';

/** O que abrir: uma reunião já marcada (`id`) ou uma nova, à partida num dia. */
export interface MeetingTarget {
  id: number | null;
  date?: string;
}

/** O botão que leva à videochamada. Abre o link num separador novo. */
export function JoinButton({ meeting, size = 'md', variant = 'primary' }: { meeting: Pick<Meeting, 'link'>; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' }) {
  return (
    <LinkButton href={meeting.link} target="_blank" rel="noopener noreferrer" variant={variant} size={size} icon={<Video className="size-4" />}>
      Entrar na reunião
    </LinkButton>
  );
}

/** Marcar, ver ou alterar uma reunião. Quem não a marcou (e não é administrador) só a vê. */
export function MeetingDialog({ target, onClose }: { target: MeetingTarget; onClose: () => void }) {
  const { data } = useData();
  const existing = target.id === null ? null : data.meetings.find((m) => m.id === target.id) ?? null;

  if (target.id !== null && !existing) {
    return (
      <Modal title="Reunião" onClose={onClose} footer={<><span className="flex-1" /><Button onClick={onClose}>Fechar</Button></>}>
        <p className="text-sm text-ink-2">Esta reunião já não existe. Pode ter sido cancelada.</p>
      </Modal>
    );
  }
  if (existing && !canEditMeeting(data.me, existing)) return <MeetingDetails meeting={existing} onClose={onClose} />;
  return <MeetingForm existing={existing} date={target.date ?? data.today} onClose={onClose} />;
}

function Attendee({ id, extra }: { id: number; extra?: ReactNode }) {
  const m = useTeam().member(id);
  if (!m) return null;
  return (
    <li className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[13px] text-ink">
      <Avatar name={m.name} color={m.color} size="xs" />
      {m.name}
      {extra}
    </li>
  );
}

function LinkBox({ meeting }: { meeting: Meeting }) {
  const provider = providerOf(meeting.link);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info"><Video className="size-5" /></span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-ink">{provider ?? 'Videochamada'}</p>
        <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-[13px] text-ink-3 underline-offset-2 hover:underline">
          <span className="truncate">{meeting.link.replace(/^https?:\/\//, '')}</span>
          <ExternalLink aria-hidden className="size-3 shrink-0" />
        </a>
      </div>
      <JoinButton meeting={meeting} />
    </div>
  );
}

function MeetingDetails({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const team = useTeam();
  return (
    <Modal
      title={meeting.title}
      subtitle={`${longDayLabel(meeting.date)} · ${timeRange(meeting)}`}
      onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Fechar</Button></>}
    >
      <div className="grid gap-4">
        {meeting.link ? <LinkBox meeting={meeting} /> : <p className="text-[13px] text-ink-3">Sem link de videochamada.</p>}
        <FieldGroup label="Participantes">
          <ul className="flex flex-wrap gap-1.5">
            {meeting.attendee_ids.map((id) => (
              <Attendee key={id} id={id} extra={id === meeting.created_by ? <span className="text-xs text-ink-3">· marcou</span> : undefined} />
            ))}
          </ul>
        </FieldGroup>
        {meeting.notes && (
          <FieldGroup label="Notas"><p className="text-sm whitespace-pre-wrap text-ink-2">{linkify(meeting.notes)}</p></FieldGroup>
        )}
        <p className="text-xs text-ink-3">Só {team.nameOf(meeting.created_by)}, que marcou a reunião, e os administradores a podem alterar.</p>
      </div>
    </Modal>
  );
}

function MeetingForm({ existing, date: initialDate, onClose }: { existing: Meeting | null; date: string; onClose: () => void }) {
  const { data, refresh, mutate } = useData();
  const team = useTeam();
  const confirm = useConfirm();
  const organiser = existing?.created_by ?? data.me.id;
  const people = team.people.filter((m) => m.active);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? initialDate);
  const [start, setStart] = useState(existing?.start_time ?? '10:00');
  const [end, setEnd] = useState(existing?.end_time ?? '10:30');
  const [link, setLink] = useState(existing?.link ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [who, setWho] = useState<number[]>(existing ? existing.attendee_ids : people.map((m) => m.id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const provider = link.trim() ? providerOf(link.trim()) : null;
  const everyone = people.every((m) => who.includes(m.id) || m.id === organiser);

  function changeStart(value: string) {
    setStart(value);
    if (value && (!end || end <= value)) setEnd(addMinutes(value, 30));
  }
  function toggle(id: number) {
    setWho((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const ids = [...new Set([...who.filter((id) => people.some((m) => m.id === id)), organiser])];
    const payload = { title, date, start_time: start, end_time: end, link, notes, attendee_ids: ids };
    try {
      if (existing) await patch(`/api/meetings/${existing.id}`, payload);
      else await post('/api/meetings', payload);
      onClose();
      await refresh();
    } catch (ex) {
      setError(errorMessage(ex));
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!(await confirm({ title: 'Cancelar reunião?', message: 'A reunião sai do calendário e os participantes recebem um aviso.', confirmLabel: 'Cancelar reunião', tone: 'danger' }))) return;
    onClose();
    await mutate(() => del(`/api/meetings/${existing.id}`));
  }

  return (
    <Modal
      title={existing ? 'Reunião' : 'Marcar reunião'}
      subtitle={existing ? `Marcada por ${team.nameOf(existing.created_by)}` : 'Os participantes recebem um aviso.'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {existing && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>Cancelar reunião</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Fechar</Button>
          <Button type="submit" variant="primary" loading={busy}>{existing ? 'Guardar' : 'Marcar'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {existing?.link && <div className="sm:col-span-3"><LinkBox meeting={existing} /></div>}
        <Field label="Título" className="sm:col-span-3">
          <Input required autoFocus={!existing} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Por exemplo, ponto de situação" />
        </Field>
        <Field label="Dia">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Começa às">
          <Input type="time" required value={start} onChange={(e) => changeStart(e.target.value)} />
        </Field>
        <Field label="Acaba às">
          <Input type="time" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field
          label="Link da videochamada"
          className="sm:col-span-3"
          hint={provider ? `${provider}. Os participantes veem o botão “Entrar na reunião”.` : 'Opcional. Cola o link do Google Meet, Teams ou Zoom.'}
        >
          <Input type="text" inputMode="url" autoComplete="off" spellCheck={false} value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="https://meet.google.com/…" />
        </Field>
        <FieldGroup label="Participantes" className="sm:col-span-3">
          <div role="group" aria-label="Participantes" className="flex flex-wrap gap-1.5">
            {people.map((m) => {
              const on = who.includes(m.id) || m.id === organiser;
              const locked = m.id === organiser;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  onClick={() => toggle(m.id)}
                  style={vars({ '--c': m.color })}
                  title={locked ? 'Quem marca a reunião fica sempre incluído' : undefined}
                  className={cx(
                    'inline-flex h-8 items-center gap-2 rounded-full border py-0.5 pr-3 pl-1 text-[13px] font-medium transition-colors disabled:cursor-default',
                    on ? 'tint border-[var(--c)]' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-3',
                  )}
                >
                  <Avatar name={m.name} color={m.color} size="xs" />
                  {m.name}
                </button>
              );
            })}
          </div>
          {people.length > 2 && (
            <button
              type="button"
              className="justify-self-start text-xs text-ink-3 underline underline-offset-2 hover:text-ink"
              onClick={() => setWho(everyone ? [organiser] : people.map((m) => m.id))}
            >
              {everyone ? 'Ficar só eu' : 'Toda a equipa'}
            </button>
          )}
        </FieldGroup>
        <Field label="Notas" className="sm:col-span-3">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Opcional: assuntos, sala, o que trazer…" />
        </Field>
        <div className="sm:col-span-3"><FormError>{error}</FormError></div>
      </div>
    </Modal>
  );
}
