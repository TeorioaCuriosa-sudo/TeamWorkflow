import { AppShell } from './layout/AppShell';
import { CalendarPage } from './pages/Calendar';
import { ChatPage } from './pages/Chat';
import { HistoryPage } from './pages/History';
import { LoginPage } from './pages/Login';
import { ProjectsPage } from './pages/Projects';
import { TemplatesPage } from './pages/Templates';
import { SettingsPage } from './pages/Settings';
import { WorkflowPage } from './pages/Workflow';
import { ForcedPasswordDialog } from './features/profile/ProfileDialog';
import { ChatProvider } from './state/chat';
import { DataProvider } from './state/data';
import { DialogsProvider } from './state/dialogs';
import { DmProvider } from './state/dm';
import { useRoute } from './state/route';
import { SessionProvider, useSession } from './state/session';
import { ConfirmProvider } from './ui/Modal';
import { FullPageSpinner } from './ui/misc';
import { ToastProvider } from './ui/Toast';

function Page() {
  const route = useRoute();
  switch (route.view) {
    case 'calendario': return <CalendarPage />;
    case 'projetos': return <ProjectsPage />;
    case 'modelos': return <TemplatesPage />;
    case 'historico': return <HistoryPage />;
    case 'chat': return <ChatPage />;
    case 'definicoes': return <SettingsPage />;
    default: return <WorkflowPage />;
  }
}

function Authenticated() {
  const route = useRoute();
  return (
    <DataProvider month={route.view === 'workflow' ? route.month : null}>
      <ChatProvider>
        <DmProvider>
          <DialogsProvider>
            <AppShell view={route.view}>
              <div key={route.view} className="animate-[fade-in_160ms_ease-out]">
                <Page />
              </div>
            </AppShell>
          </DialogsProvider>
        </DmProvider>
      </ChatProvider>
    </DataProvider>
  );
}

function Root() {
  const { session } = useSession();
  if (session.status === 'loading') return <FullPageSpinner />;
  if (session.status === 'out') return <LoginPage />;
  if (session.mustChange) {
    return (
      <div className="min-h-dvh bg-canvas">
        <ForcedPasswordDialog />
      </div>
    );
  }
  return <Authenticated />;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
