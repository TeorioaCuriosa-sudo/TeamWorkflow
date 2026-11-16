import type { FormEvent } from 'react';
import { useState } from 'react';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { ApiError, del, errorMessage, patch, post } from '../../api/client';
import type { Member, Role } from '../../api/types';
import { ROLE_KEYS, ROLE_LABEL, ROLES_FOR_COMMANDER } from '../../lib/labels';
import { plural } from '../../lib/text';
import { useData, useTeam } from '../../state/data';
import { PersonAvatar } from '../people/PersonAvatar';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { ColorPicker } from '../../ui/ColorPicker';
import { CommitInput, Field, Input, Select, Switch } from '../../ui/Fields';
import { Modal, useConfirm } from '../../ui/Modal';
import { FormError } from '../../ui/misc';
import { useToast } from '../../ui/Toast';
import { SettingsSection } from './SettingsSection';

export function TeamSection() {
  const { data, mutate, refresh } = useData();
  const team = useTeam();
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [reveal, setReveal] = useState<{ title: string; name: string; email?: string | null; password: string } | null>(null);
  const [removing, setRemoving] = useState<{ member: Member; open: number } | null>(null);

  async function resetPassword(m: Member) {
    if (!(await confirm({ title: `Repor a palavra-passe de ${m.name}?`, message: 'As sessões abertas dela são terminadas.', confirmLabel: 'Repor' }))) return;
    try {
      const res = await post<{ temp_password: string }>(`/api/members/${m.id}/reset-password`, {});
      setReveal({ title: 'Palavra-passe reposta', name: m.name, email: m.email, password: res.temp_password });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function remove(m: Member) {
    if (!(await confirm({
      title: `Remover ${m.name}?`,
      message: 'Deixa de poder entrar na plataforma. O que já concluiu fica no histórico.',
      confirmLabel: 'Remover',
      tone: 'danger',
    }))) return;
    try {
      await del(`/api/members/${m.id}`, {});
      toast.success(`${m.name} foi removida.`);
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && typeof e.data.open_tasks === 'number') setRemoving({ member: m, open: e.data.open_tasks });
      else toast.error(errorMessage(e));
    }
  }

  const edit = (m: Member, body: Record<string, unknown>) => mutate(() => patch(`/api/members/${m.id}`, body));

  return (
    <SettingsSection
      title="Equipa"
      hint={team.isAdmin
        ? 'Cada pessoa tem a sua conta. Os administradores podem tudo; os comandantes também adicionam pessoas. Só os administradores removem pessoas, repõem palavras-passe e mudam funções. Marketing e informática têm acesso de membro. Quem deixa de estar visível sai do quadro, mas o histórico mantém-se.'
        : team.can.add_people
          ? 'Como comandante, podes adicionar pessoas (membros, marketing ou informática). Remover pessoas e mudar funções é com os administradores. O teu nome, cor e estado mudam-se em “Perfil, estado e avisos”.'
          : 'Só os administradores e os comandantes adicionam pessoas. O teu nome, cor e estado mudam-se em “Perfil, estado e avisos”.'}
    >
      <ul className="grid gap-3">
        {team.people.map((m) => {
          const self = m.id === team.me.id;
          if (!team.isAdmin) {
            return (
              <li key={m.id} className="flex items-center gap-3">
                <PersonAvatar member={m} size="md" online={m.online} />
                <span className="flex-1 text-sm font-medium text-ink">{m.name}</span>
                {m.role !== 'member' && <Badge>{ROLE_LABEL[m.role]}</Badge>}
                <span className="text-[13px] text-ink-3">{m.online ? 'Online' : 'Offline'}</span>
              </li>
            );
          }
          return (
            <li key={m.id} className="grid gap-3 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <PersonAvatar member={m} size="lg" online={m.online} ringClass="ring-surface-2" />
                <CommitInput className="min-w-40 flex-1 basis-40" value={m.name} maxLength={60} aria-label={`Nome de ${m.name}`} onCommit={(v) => void edit(m, { name: v })} />
                <CommitInput className="min-w-52 flex-1 basis-52" type="email" value={m.email ?? ''} aria-label={`Email de ${m.name}`} onCommit={(v) => void edit(m, { email: v })} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <ColorPicker size="sm" label={`Cor de ${m.name}`} value={m.color} options={data.palette} onChange={(c) => void edit(m, { color: c })} />
                <span className="flex-1" />
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  Função
                  <div className="w-40">
                    <Select value={m.role} aria-label={`Função de ${m.name}`} className="h-8 text-[13px]" onChange={(e) => void edit(m, { role: e.target.value as Role })}>
                      {ROLE_KEYS.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                    </Select>
                  </div>
                </label>
                <Switch checked={m.active} onChange={(v) => void edit(m, { active: v })} label="Visível no quadro" />
                {!self && <Button size="sm" icon={<KeyRound className="size-3.5" />} onClick={() => void resetPassword(m)}>Repor palavra-passe</Button>}
                {!self && <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => void remove(m)}>Remover</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      {team.can.add_people && (
        <div className="flex justify-end">
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Adicionar pessoa</Button>
        </div>
      )}

      {adding && (
        <AddPersonDialog
          onClose={() => setAdding(false)}
          onCreated={(info) => {
            setAdding(false);
            if (info.password) setReveal({ title: 'Pessoa adicionada', name: info.name, email: info.email, password: info.password });
            else toast.success(`${info.name} foi adicionada.`);
          }}
        />
      )}
      {reveal && <RevealPasswordDialog {...reveal} onClose={() => setReveal(null)} />}
      {removing && <RemovePersonDialog member={removing.member} openTasks={removing.open} onClose={() => setRemoving(null)} />}
    </SettingsSection>
  );
}

function AddPersonDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (info: { name: string; email: string; password: string | null }) => void }) {
  const { refresh } = useData();
  const team = useTeam();
  const roles = team.isAdmin ? ROLE_KEYS : ROLES_FOR_COMMANDER;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await post<{ member: Member; temp_password: string | null }>('/api/members', { name, email, role, ...(password ? { password } : {}) });
      await refresh();
      onCreated({ name: res.member.name, email, password: res.temp_password });
    } catch (ex) {
      setError(errorMessage(ex));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Adicionar pessoa"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy}>Adicionar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="Nome" /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" placeholder="nome@empresa.pt" /></Field>
        <Field label="Função">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Palavra-passe inicial (opcional)">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="off" placeholder="Deixar vazio para gerar uma" />
        </Field>
        <p className="text-[13px] text-ink-3 sm:col-span-2">A pessoa tem de mudar a palavra-passe no primeiro acesso.</p>
        <div className="sm:col-span-2"><FormError>{error}</FormError></div>
      </div>
    </Modal>
  );
}

function RevealPasswordDialog({ title, name, email, password, onClose }: { title: string; name: string; email?: string | null; password: string; onClose: () => void }) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Copiada.');
    } catch {
      toast.show('Seleciona e copia (Ctrl+C).');
    }
  }

  return (
    <Modal
      size="sm"
      title={title}
      onClose={onClose}
      footer={<><span className="flex-1" /><Button variant="primary" onClick={onClose}>Já guardei</Button></>}
    >
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Palavra-passe temporária de <b className="text-ink">{name}</b>{email ? ` (${email})` : ''}. Só é mostrada agora; ao entrar, a pessoa escolhe uma nova.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            data-autofocus
            value={password}
            aria-label="Palavra-passe temporária"
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 font-mono text-sm text-ink focus:border-ring focus:ring-3 focus:ring-ring/20 focus:outline-none"
          />
          <Button icon={<Copy className="size-4" />} onClick={() => void copy()}>Copiar</Button>
        </div>
      </div>
    </Modal>
  );
}

function RemovePersonDialog({ member, openTasks, onClose }: { member: Member; openTasks: number; onClose: () => void }) {
  const { refresh } = useData();
  const team = useTeam();
  const toast = useToast();
  const others = team.people.filter((x) => x.id !== member.id);
  const [target, setTarget] = useState<string>(others[0] ? String(others[0].id) : 'discard');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await del(`/api/members/${member.id}`, target === 'discard' ? { discard_open: true } : { reassign_to: Number(target) });
      onClose();
      toast.success(`${member.name} foi removida.`);
      await refresh();
    } catch (ex) {
      setError(errorMessage(ex));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Remover ${member.name}`}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="destructive" loading={busy}>Remover pessoa</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-ink-2">
          {member.name} tem {plural(openTasks, 'tarefa em aberto', 'tarefas em aberto')}. O que já foi concluído continua no histórico.
        </p>
        <Field label="O que fazer às tarefas em aberto">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((x) => <option key={x.id} value={x.id}>Passar para {x.name}</option>)}
            <option value="discard">Apagar as tarefas em aberto</option>
          </Select>
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
