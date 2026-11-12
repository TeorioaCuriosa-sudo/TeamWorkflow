// O meu perfil: nome, cor, estado, avisos por email e palavra-passe.

import type { FormEvent } from 'react';
import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { errorMessage, patch, post } from '../../api/client';
import type { PresenceStatus } from '../../api/types';
import { STATUS_KEYS, STATUS_LABEL } from '../../lib/labels';
import { useData } from '../../state/data';
import { useSession } from '../../state/session';
import { Button } from '../../ui/Button';
import { ColorPicker } from '../../ui/ColorPicker';
import { Field, FieldGroup, Input, Select, Switch } from '../../ui/Fields';
import { Modal } from '../../ui/Modal';
import { FormError } from '../../ui/misc';
import { useToast } from '../../ui/Toast';

const DURATIONS: Array<[string, string]> = [
  ['keep', 'Manter o prazo atual'],
  ['none', 'Sem prazo'],
  ['60', 'Durante 1 hora'],
  ['240', 'Durante 4 horas'],
  ['eod', 'Até ao fim do dia'],
];

function untilFrom(choice: string, current: string | null): string | null {
  if (choice === 'keep') return current;
  if (choice === 'none') return null;
  if (choice === 'eod') {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() + Number(choice) * 60_000).toISOString();
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { data, refresh } = useData();
  const { logout } = useSession();
  const toast = useToast();
  const me = data.me;

  const hasUntil = Boolean(me.status_until) && me.status !== 'available';
  const [name, setName] = useState(me.name);
  const [color, setColor] = useState(me.color);
  const [status, setStatus] = useState<PresenceStatus>(me.status);
  const [statusText, setStatusText] = useState(me.status_text);
  const [until, setUntil] = useState(hasUntil ? 'keep' : 'none');
  const [mailApprovals, setMailApprovals] = useState(me.mail_approvals);
  const [mailUpdates, setMailUpdates] = useState(me.mail_updates);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await patch('/api/me', {
        name,
        color,
        status,
        status_text: statusText,
        status_until: status === 'available' ? null : untilFrom(until, me.status_until),
        mail_approvals: mailApprovals,
        mail_updates: mailUpdates,
      });
      onClose();
      toast.success('Perfil guardado.');
      await refresh();
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="O meu perfil"
      subtitle={me.email ?? undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => { onClose(); void logout(); }}>
            Terminar sessão
          </Button>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="profile-form" variant="primary" loading={saving}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-6">
        <form id="profile-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </Field>
          <FieldGroup label="Cor" className="sm:col-span-2">
            <ColorPicker value={color} options={data.palette} onChange={setColor} label="Cor" />
          </FieldGroup>

          <h3 className="mt-2 text-sm font-semibold text-ink sm:col-span-2">O meu estado</h3>
          <Field label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value as PresenceStatus)}>
              {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </Select>
          </Field>
          {status !== 'available' && (
            <Field label="Durante">
              <Select value={until} onChange={(e) => setUntil(e.target.value)}>
                {DURATIONS.filter(([k]) => hasUntil || k !== 'keep').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Mensagem (opcional)" className="sm:col-span-2">
            <Input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={80} placeholder="Ex.: a rever o contrato do cliente" />
          </Field>

          <h3 className="mt-2 text-sm font-semibold text-ink sm:col-span-2">Avisos por email</h3>
          <Switch className="sm:col-span-2" checked={mailApprovals} onChange={setMailApprovals} label="Pedidos de aprovação e respostas" />
          <Switch
            className="sm:col-span-2"
            checked={mailUpdates}
            onChange={setMailUpdates}
            label="Atualizações das minhas tarefas"
            hint="Comentários, mudanças de estado e tarefas novas."
          />
          <p className="text-xs text-ink-3 sm:col-span-2">Dentro da plataforma recebes sempre os avisos, no sino do cabeçalho.</p>
          <div className="sm:col-span-2"><FormError>{error}</FormError></div>
        </form>

        <PasswordForm />
      </div>
    </Modal>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await post('/api/me/password', { current, next });
      setCurrent('');
      setNext('');
      toast.success('Palavra-passe alterada. Os outros dispositivos foram desligados.');
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-line bg-surface-2 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <KeyRound className="size-4 text-ink-3" aria-hidden />
        Mudar a palavra-passe
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Atual">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nova (mín. 8 caracteres)">
          <Input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
      <FormError>{error}</FormError>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={busy} disabled={!current || next.length < 8}>Mudar palavra-passe</Button>
      </div>
    </form>
  );
}

/** Primeiro acesso (ou palavra-passe reposta): não se pode fechar até escolher uma nova. */
export function ForcedPasswordDialog() {
  const { logout, passwordChanged } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== again) { setError('As duas palavras-passe novas não coincidem.'); return; }
    setBusy(true);
    try {
      await post('/api/me/password', { current, next });
      passwordChanged();
      toast.success('Palavra-passe definida. Bem-vindo!');
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Escolhe a tua palavra-passe"
      locked
      onClose={() => {}}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={() => void logout()}>Terminar sessão</Button>
          <span className="flex-1" />
          <Button type="submit" variant="primary" loading={busy}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-ink-2">Por segurança, escolhe agora uma palavra-passe só tua. Tem pelo menos 8 caracteres.</p>
        <Field label="Palavra-passe temporária">
          <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nova palavra-passe">
            <Input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repete a nova palavra-passe">
            <Input type="password" autoComplete="new-password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} />
          </Field>
        </div>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
