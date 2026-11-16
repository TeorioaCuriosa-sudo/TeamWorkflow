// Janelas que se podem abrir de qualquer sítio: a tarefa e a reunião (pelo cartão, pelo sino ou por uma
// ligação de email) e o meu perfil.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MeetingDialog, type MeetingTarget } from '../features/calendar/MeetingDialog';
import { ProfileDialog } from '../features/profile/ProfileDialog';
import { NewTaskDialog, TaskDialog } from '../features/task/TaskDialog';
import { clearLinkFromUrl, useRoute } from './route';

interface DialogsApi {
  openTask: (id: number) => void;
  /** Abre o formulário completo de uma tarefa nova para esta pessoa. */
  openNewTask: (memberId: number) => void;
  openProfile: () => void;
  /** Abre uma reunião já marcada. */
  openMeeting: (id: number) => void;
  /** Abre o formulário para marcar uma reunião (num dia à escolha). */
  openNewMeeting: (date?: string) => void;
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
  const [meeting, setMeeting] = useState<MeetingTarget | null>(null);
  const route = useRoute();

  const openTask = useCallback((id: number) => setTaskId(id), []);
  const openNewTask = useCallback((memberId: number) => setNewFor(memberId), []);
  const openProfile = useCallback(() => setProfile(true), []);
  const openMeeting = useCallback((id: number) => setMeeting({ id }), []);
  const openNewMeeting = useCallback((date?: string) => setMeeting({ id: null, date }), []);

  // Ligação #task/12 (vem dos emails e dos avisos): abre a tarefa e limpa o endereço.
  useEffect(() => {
    if (route.taskId === null) return;
    setTaskId(route.taskId);
    clearLinkFromUrl();
  }, [route.taskId]);

  // Ligação #meeting/5: abre a reunião no calendário e limpa o endereço.
  useEffect(() => {
    if (route.meetingId === null) return;
    setMeeting({ id: route.meetingId });
    clearLinkFromUrl();
  }, [route.meetingId]);

  const value = useMemo(
    () => ({ openTask, openNewTask, openProfile, openMeeting, openNewMeeting }),
    [openTask, openNewTask, openProfile, openMeeting, openNewMeeting],
  );

  return (
    <DialogsContext value={value}>
      {children}
      {taskId !== null && <TaskDialog key={taskId} taskId={taskId} onClose={() => setTaskId(null)} />}
      {newFor !== null && <NewTaskDialog memberId={newFor} onClose={() => setNewFor(null)} />}
      {profile && <ProfileDialog onClose={() => setProfile(false)} />}
      {meeting && <MeetingDialog key={`${meeting.id ?? 'new'}`} target={meeting} onClose={() => setMeeting(null)} />}
    </DialogsContext>
  );
}
