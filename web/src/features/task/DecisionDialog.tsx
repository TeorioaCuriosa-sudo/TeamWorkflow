import type { FormEvent } from 'react';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { errorMessage, post } from '../../api/client';
import { useData } from '../../state/data';
import { Button } from '../../ui/Button';
import { Field, Textarea } from '../../ui/Fields';
import { Modal } from '../../ui/Modal';
import { FormError } from '../../ui/misc';
import { useToast } from '../../ui/Toast';

/** Aprovar ou rejeitar um pedido, com uma nota opcional. */
export function DecisionDialog({ approval, decision, onClose, onDone }: {
  approval: { id: number; title: string };
  decision: 'approved' | 'rejected';
  onClose: () => void;
  onDone?: () => void;
}) {
  const { refresh } = useData();
  const toast = useToast();
  const approve = decision === 'approved';
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await post(`/api/approvals/${approval.id}/decision`, { decision, note });
      onClose();
      toast.success(approve ? 'Aprovado. A pessoa foi avisada.' : 'Rejeitado. A pessoa foi avisada.');
      onDone?.();
      await refresh();
    } catch (ex) {
      setError(errorMessage(ex));
      setBusy(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={approve ? 'Aprovar pedido' : 'Rejeitar pedido'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={onClose}>Voltar</Button>
          <Button
            type="submit"
            variant={approve ? 'success' : 'destructive'}
            loading={busy}
            icon={approve ? <Check className="size-4" /> : <X className="size-4" />}
          >
            {approve ? 'Aprovar' : 'Rejeitar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-ink-2">
          {approve ? 'Aprovar' : 'Rejeitar'} <b className="font-semibold text-ink">{approval.title}</b>?
        </p>
        <Field label="Nota">
          <Textarea
            data-autofocus
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={approve ? 'Nota (opcional)' : 'Diz o que falta ou o que deve mudar (opcional)'}
          />
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}
