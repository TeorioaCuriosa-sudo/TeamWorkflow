import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CircleCheck, MessageSquare, Users } from 'lucide-react';
import { errorMessage } from '../api/client';
import { useSession } from '../state/session';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Fields';
import { Wordmark } from '../ui/Logo';
import { FormError } from '../ui/misc';

const POINTS = [
  { icon: <Users />, title: 'Quadro partilhado em direto', text: 'Cada pessoa com as suas tarefas; as alterações aparecem a todos na hora.' },
  { icon: <CircleCheck />, title: 'Aprovações com registo', text: 'Pede e dá aprovação a uma tarefa, com notas e avisos por email.' },
  { icon: <CalendarDays />, title: 'Calendário e histórico', text: 'Férias, formações, reuniões com link de videochamada e o arquivo mensal do que ficou feito.' },
  { icon: <MessageSquare />, title: 'Chat da equipa', text: 'Um canal único para o dia a dia, sem sair da plataforma.' },
];

export function LoginPage() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pw = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = 'Entrar · Teoria Workflow'; }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (ex) {
      setError(errorMessage(ex));
      setBusy(false);
      pw.current?.select();
    }
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:flex xl:p-16">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full bg-accent/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-52 -left-32 size-[30rem] rounded-full bg-white/6 blur-3xl" />
        <div className="relative">
          <Wordmark on="dark" className="h-12" />
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-sidebar-ink-2 uppercase">
            <span aria-hidden className="h-px w-6 bg-accent" />
            Workflow
          </p>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight xl:text-[2.75rem]">O trabalho da equipa, num só sítio.</h1>
          <ul className="mt-10 grid gap-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/8 text-accent ring-1 ring-white/10 [&>svg]:size-5">{p.icon}</span>
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-sidebar-ink-2">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-sidebar-ink-2">Teoria Curiosa · Plataforma interna</p>
      </aside>

      <main className="grid place-items-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark className="h-10" />
            <p className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase">
              <span aria-hidden className="h-px w-5 bg-accent" />
              Workflow
            </p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Entrar</h2>
          <p className="mt-1.5 text-sm text-ink-3">Usa a tua conta da equipa.</p>

          <form onSubmit={submit} className="mt-8 grid gap-4">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                required
                autoFocus
                placeholder="o.teu@email.pt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </Field>
            <Field label="Palavra-passe">
              <Input
                ref={pw}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </Field>
            <FormError>{error}</FormError>
            <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">
              Entrar
            </Button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-ink-3">Esqueceste-te da palavra-passe? Pede a um administrador para a repor.</p>
        </div>
      </main>
    </div>
  );
}
