import { errorMessage, post } from '../../api/client';
import type { TaskTemplate } from '../../api/types';
import { useData, useTeam } from '../../state/data';
import { useToast } from '../../ui/Toast';

/**
 * Aplica um modelo no cartão de uma pessoa: um clique e a tarefa existe.
 * No cartão de outra pessoa, o que se cria é um pedido (como em qualquer tarefa nova).
 */
export function useApplyTemplate() {
  const { refresh } = useData();
  const team = useTeam();
  const toast = useToast();

  return async function apply(template: TaskTemplate, memberId: number): Promise<boolean> {
    const mine = memberId === team.me.id;
    const who = team.nameOf(memberId);
    try {
      await post(`/api/templates/${template.id}/apply`, { member_id: memberId });
      toast.success(
        !team.isAdmin && !mine
          ? `Pedido “${template.title}” enviado a ${who}.`
          : mine ? `Tarefa “${template.title}” criada no teu cartão.` : `Tarefa “${template.title}” criada no cartão de ${who}.`,
      );
      await refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };
}
