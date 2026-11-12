import { Monitor, Moon, Sun, User } from 'lucide-react';
import { STATUS_LABEL } from '../../lib/labels';
import { useTeam } from '../../state/data';
import { useDialogs } from '../../state/dialogs';
import { THEME_LABEL, useTheme, type ThemeMode } from '../../state/theme';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Chip';
import { Segmented } from '../../ui/Fields';
import { SettingsSection } from './SettingsSection';

const THEME_ICON = { auto: <Monitor className="size-4" />, light: <Sun className="size-4" />, dark: <Moon className="size-4" /> };

export function AccountSection() {
  const { me } = useTeam();
  const { openProfile } = useDialogs();
  const { mode, setMode } = useTheme();

  return (
    <SettingsSection title="A minha conta">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={me.name} color={me.color} size="lg" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            {me.name}
            <Badge>{me.role === 'admin' ? 'Administrador' : 'Membro'}</Badge>
          </p>
          <p className="text-[13px] text-ink-3">{me.email} · {STATUS_LABEL[me.status]}{me.status_text ? ` · ${me.status_text}` : ''}</p>
        </div>
        <Button icon={<User className="size-4" />} onClick={openProfile}>Perfil, estado e avisos</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <div className="flex-1 basis-56">
          <p className="text-sm font-medium text-ink">Aspeto da plataforma</p>
          <p className="text-[13px] text-ink-3">Automático segue o tema do teu sistema. Fica guardado neste browser.</p>
        </div>
        <Segmented<ThemeMode>
          label="Aspeto"
          value={mode}
          onChange={setMode}
          options={(Object.keys(THEME_LABEL) as ThemeMode[]).map((k) => ({ value: k, label: <>{THEME_ICON[k]}{THEME_LABEL[k]}</> }))}
        />
      </div>
    </SettingsSection>
  );
}
