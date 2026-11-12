import { useState } from 'react';
import { Download, Mail, Send } from 'lucide-react';
import { errorMessage, post } from '../../api/client';
import { useData } from '../../state/data';
import { Button, LinkButton } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { SettingsSection } from './SettingsSection';

export function MailSection() {
  const { data } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mail = data.mail;

  async function test() {
    setBusy(true);
    try {
      const res = await post<{ to: string }>('/api/admin/mail-test', {});
      toast.success(`Email de teste enviado para ${res.to}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="Email e dados"
      hint="Os avisos por email (pedidos de aprovação e atualizações) respeitam as preferências de cada pessoa. Tudo fica numa base de dados SQLite no servidor; a cópia de segurança em JSON não inclui palavras-passe."
    >
      {mail?.enabled ? (
        <p className="flex items-start gap-2.5 rounded-xl bg-success-soft px-3.5 py-3 text-sm text-success">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          Envio de email ligado ({mail.host}), remetente {mail.from}.
        </p>
      ) : (
        <p className="flex items-start gap-2.5 rounded-xl bg-warn-soft px-3.5 py-3 text-sm text-warn">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          Envio de email desligado. Define SMTP_HOST (e as restantes variáveis SMTP) no servidor para as pessoas receberem avisos por email.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Send className="size-4" />} loading={busy} disabled={!mail?.enabled} onClick={() => void test()}>Enviar email de teste para mim</Button>
        <span className="flex-1" />
        <LinkButton href="/api/backup" download icon={<Download className="size-4" />}>Descarregar cópia de segurança (JSON)</LinkButton>
      </div>
    </SettingsSection>
  );
}
