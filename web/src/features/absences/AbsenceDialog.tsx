import type { FormEvent } from 'react';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { del, errorMessage, patch, post } from '../../api/client';
import type { Absence, AbsenceType } from '../../api/types';
import { workdaysBetween } from '../../lib/dates';
import { ABSENCE_TYPES } from '../../lib/labels';
import { plural } from '../../lib/text';
import { useData, useTeam } from '../../state/data';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Fields';
import { Modal, useConfirm } from '../../ui/Modal';
import { FormError } from '../../ui/misc';

/** Registar ou editar uma ausência (férias, ausência, formação). */
export function AbsenceDialog({ absence, onClose }: { absence: Absence | null; onClose: () => void }) {
  const { data, refresh, mutate } = useData();
  const team = useTeam();
  const confirm = useConfirm();
  const isNew = !absence;

  const [who, setWho] = useState(absence?.member_id ?? data.me.id);
  const [type, setType] = useState<AbsenceType>(absence?.type ?? 'ferias');
  const [from, setFrom] = useState(absence?.start_date ?? data.today);
  const [to, setTo] = useState(absence?.end_date ?? data.today);
  const [note, setNote] = useState(absence?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const people = team.people.filter((m) => m.active || m.id === absence?.member_id);
  const days = from && to && to >= from ? workdaysBetween(from, to, data.extraHolidays) : null;

  function changeFrom(value: string) {
    setFrom(value);
    if (!to || to < value) setTo(value);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = { member_id: who, type, start_date: from, end_date: to, note };
    try {
      if (absence) await patch(`/api/absences/${absence.id}`, payload);
      else await post('/api/absences', payload);
      onClose();
      await refresh();
    } catch (ex) {
      setError(errorMessage(ex));
      setBusy(false);
    }
  }

  async function remove() {
    if (!absence) return;
    if (!(await confirm({ title: 'Apagar ausência?', message: 'Esta ausência vai ser removida do calendário.', confirmLabel: 'Apagar', tone: 'danger' }))) return;
    onClose();
    await mutate(() => del(`/api/absences/${absence.id}`));
  }

  return (
    <Modal
      title={isNew ? 'Registar ausência' : 'Editar ausência'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {!isNew && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>Apagar</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy}>{isNew ? 'Registar' : 'Guardar'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pessoa">
          <Select value={who} onChange={(e) => setWho(Number(e.target.value))}>
            {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
            {(Object.keys(ABSENCE_TYPES) as AbsenceType[]).map((k) => <option key={k} value={k}>{ABSENCE_TYPES[k]}</option>)}
          </Select>
        </Field>
        <Field label="Primeiro dia">
          <Input type="date" required value={from} onChange={(e) => changeFrom(e.target.value)} />
        </Field>
        <Field label="Último dia">
          <Input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Nota" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Opcional" />
        </Field>
        {days !== null && (
          <p className="text-[13px] text-ink-3 sm:col-span-2">{plural(days, 'dia útil', 'dias úteis')} (sem fins de semana nem feriados nacionais)</p>
        )}
        <div className="sm:col-span-2"><FormError>{error}</FormError></div>
      </div>
    </Modal>
  );
}
