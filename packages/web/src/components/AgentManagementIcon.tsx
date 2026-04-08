'use client';

type AgentManagementIconName =
  | 'persona'
  | 'collab'
  | 'skills'
  | 'template'
  | 'edit'
  | 'close'
  | 'check'
  | 'more'
  | 'delete'
  | 'refresh'
  | 'random';

const ICON_PATHS: Record<AgentManagementIconName, string> = {
  persona: '/images/agent-management-icons/agent-persona.svg',
  collab: '/images/agent-management-icons/agent-collab.svg',
  skills: '/images/agent-management-icons/agent-skills.svg',
  template: '/images/agent-management-icons/agent-template.svg',
  edit: '/images/agent-management-icons/agent-edit.svg',
  close: '/images/agent-management-icons/agent-close.svg',
  check: '/images/agent-management-icons/agent-check.svg',
  more: '/images/agent-management-icons/agent-more.svg',
  delete: '/images/agent-management-icons/agent-delete.svg',
  refresh: '/images/agent-management-icons/agent-refresh.svg',
  random: '/images/agent-management-icons/agent-random-avatar.svg',
};

export function AgentManagementIcon({
  name,
  className,
  preserveOriginalColor = false,
}: {
  name: AgentManagementIconName;
  className?: string;
  preserveOriginalColor?: boolean;
}) {
  const imageClassName = [name === 'edit' && !preserveOriginalColor ? 'brightness-0' : null, className]
    .filter(Boolean)
    .join(' ');
  return <img src={ICON_PATHS[name]} alt="" aria-hidden="true" className={imageClassName} />;
}
