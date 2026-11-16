import { useState } from 'react';
import { CopyPlus, LayoutTemplate, Paperclip, Pencil, Plus } from 'lucide-react';
import type { TaskTemplate } from '../api/types';
import { TemplateDialog, canChangeTemplate } from '../features/templates/TemplateDialog';
import { useApplyTemplate } from '../features/templates/useApplyTemplate';
import { filesOf } from '../lib/files';
import { TEMPLATE_KIND_LABEL } from '../lib/labels';
import { useData, useTeam } from '../state/data';
import { go, useRoute } from '../state/route';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { Chip, UrgencyBadge } from '../ui/Chip';
import { Segmented } from '../ui/Fields';
import { Card, EmptyState, PageHeader } from '../ui/misc';
import { MenuItem, Popover } from '../ui/Popover';

type Kind = TaskTemplate['kind'];

export function TemplatesPage() {
  const { data } = useData();
  const route = useRoute();
  const kind: Kind = route.kind ?? 'monthly';
  const [editing, setEditing] = useState<TaskTemplate | 'new' | null>(null);
  const items = data.templates.filter((t) => t.kind === kind);
  const counts: Record<Kind, number> = {
    monthly: data.templates.filter((t) => t.kind === 'monthly').length,
    weekly: data.templates.filter((t) => t.kind === 'weekly').length,
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title="Modelos de tarefas"
        description="Tarefas que se repetem todos os meses ou todas as semanas. Guarda-as uma vez e aplica-as com um clique no cartão de quem as vai fazer."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Novo modelo</Button>}
      />

      <Segmented<Kind>
        label="Tipo de modelo"
        value={kind}
        onChange={(k) => go('modelos', k)}
        className="justify-self-start"
        options={[
          { value: 'monthly', label: `${TEMPLATE_KIND_LABEL.monthly} (${counts.monthly})` },
          { value: 'weekly', label: `${TEMPLATE_KIND_LABEL.weekly} (${counts.weekly})` },
        ]}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutTemplate />}
            title={kind === 'monthly' ? 'Ainda não há modelos mensais' : 'Ainda não há modelos semanais'}
            action={<Button onClick={() => setEditing('new')}>Criar o primeiro</Button>}
          >
            {kind === 'monthly'
              ? 'Por exemplo, o fecho do mês ou o relatório de resultados. Defines o título, as notas, o projeto e os ficheiros uma vez.'
              : 'Por exemplo, a revisão semanal de campanhas ou o ponto de situação à sexta-feira.'}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => <TemplateCard key={t.id} template={t} onEdit={() => setEditing(t)} />)}
        </ul>
      )}

      {editing && <TemplateDialog template={editing === 'new' ? null : editing} kind={kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateCard({ template: t, onEdit }: { template: TaskTemplate; onEdit: () => void }) {
  const { data } = useData();
  const team = useTeam();
  const apply = useApplyTemplate();
  const project = team.project(t.project_id);
  const topics = t.topic_ids.map((id) => team.topic(id)).filter((x) => x !== undefined);
  const files = filesOf(data.files, 'template', t.id).length;
  const editable = canChangeTemplate(t, team.me, team.can.manage_tags);

  return (
    <li data-template-id={t.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold break-words text-ink">{t.title}</h2>
        <IconButton label={editable ? `Editar ${t.title}` : `Ver ${t.title}`} size="sm" onClick={onEdit}><Pencil className="size-4" /></IconButton>
      </div>
      {t.notes && <p className="line-clamp-3 text-[13px] leading-relaxed whitespace-pre-line text-ink-3">{t.notes}</p>}
      {(project || topics.length > 0 || t.urgency !== 'normal' || files > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {project && <Chip kind="project" color={project.color}>{project.name}</Chip>}
          {topics.map((tp) => <Chip key={tp.id} color={tp.color}>{tp.name}</Chip>)}
          <UrgencyBadge urgency={t.urgency} />
          {files > 0 && (
            <span className="num inline-flex items-center gap-1 text-xs text-ink-3" title="Ficheiros anexados">
              <Paperclip className="size-3.5" aria-hidden />
              {files}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Popover
          label={`Aplicar ${t.title} a…`}
          align="start"
          panelClassName="w-64 p-1.5"
          trigger={({ open, toggle }) => (
            <Button variant="primary" size="sm" icon={<CopyPlus className="size-4" />} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>Aplicar a…</Button>
          )}
        >
          {({ close }) => <PeopleMenu template={t} apply={apply} close={close} />}
        </Popover>
        {!team.isAdmin && <span className="text-xs text-ink-3">Para outras pessoas, vai como pedido.</span>}
      </div>
    </li>
  );
}

/** A lista de pessoas onde aplicar um modelo. */
export function PeopleMenu({ template, apply, close }: { template: TaskTemplate; apply: (t: TaskTemplate, memberId: number) => Promise<boolean>; close: () => void }) {
  const team = useTeam();
  return (
    <div role="menu" aria-label={`Aplicar ${template.title} a`} className="grid">
      {team.board.map((m) => (
        <MenuItem
          key={m.id}
          icon={<Avatar name={m.name} color={m.color} size="xs" />}
          onClick={() => { close(); void apply(template, m.id); }}
        >
          <span className="flex-1">{m.name}{m.id === team.me.id && <span className="text-ink-3"> (tu)</span>}</span>
          {!team.isAdmin && m.id !== team.me.id && <span className="text-xs text-ink-3">pedido</span>}
        </MenuItem>
      ))}
    </div>
  );
}
