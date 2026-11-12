import { AccountSection } from '../features/settings/AccountSection';
import { MailSection } from '../features/settings/MailSection';
import { RecurringSection } from '../features/settings/RecurringSection';
import { TagsSection } from '../features/settings/TagsSection';
import { TeamSection } from '../features/settings/TeamSection';
import { useTeam } from '../state/data';
import { PageHeader } from '../ui/misc';

export function SettingsPage() {
  const team = useTeam();
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <PageHeader title="Definições" description="A tua conta e a configuração da equipa." />
      <AccountSection />
      <TeamSection />
      <TagsSection />
      <RecurringSection />
      {team.isAdmin && <MailSection />}
    </div>
  );
}
