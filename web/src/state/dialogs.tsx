// Janelas que se podem abrir de qualquer sítio: a tarefa (pelo cartão, pelo sino ou por uma
// ligação de email) e o meu perfil.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ProfileDialog } from '../features/profile/ProfileDialog';
import { NewTaskDialog, TaskDialog } from '../features/task/TaskDialog';
import { clearTaskFromUrl, useRoute } from './route';

interface DialogsApi {
  openTask: (id: number) => void;
  /** Abre o formulário completo de uma tarefa nova para esta pessoa. */
  openNewTask: (memberId: number) => void;
  openProfile: () => void;
}

const DialogsContext = createContext<DialogsApi | null>(null);

export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error('useDialogs fora do DialogsProvider');
  return ctx;
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<number | null>(null);
  const [newFor, setNewFor] = useState<number | null>(null);
  const [profile, setProfile] = useState(false);
  const route = useRoute();

  const openTask = useCallback((id: number) => setTaskId(id), []);
  const openNewTask = useCallback((memberId: number) => setNewFor(memberId), []);
  const openProfile = useCallback(() => setProfile(true), []);

  // Ligação #task/12 (vem dos emails e dos avisos): abre a tarefa e limpa o endereço.
  useEffect(() => {
    if (route.taskId === null) return;
    setTaskId(route.taskId);
    clearTaskFromUrl();
  }, [route.taskId]);

  const value = useMemo(() => ({ openTask, openNewTask, openProfile }), [openTask, openNewTask, openProfile]);

  return (
    <DialogsContext value={value}>
      {children}
      {taskId !== null && <TaskDialog key={taskId} taskId={taskId} onClose={() => setTaskId(null)} />}
      {newFor !== null && <NewTaskDialog memberId={newFor} onClose={() => setNewFor(null)} />}
      {profile && <ProfileDialog onClose={() => setProfile(false)} />}
    </DialogsContext>
  );
}
