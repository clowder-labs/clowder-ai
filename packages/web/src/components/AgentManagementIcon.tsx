/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

type IconProps = {
  className?: string;
  preserveOriginalColor?: boolean;
};

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
  | 'random'
  | 'add';

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
  add: '/images/add.svg',
};

function DeleteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12.5453 5.28878C12.7955 5.28878 13.0458 5.53899 13.0458 5.78921L13.0458 13.1288C13.0458 14.1296 12.2117 14.9637 11.2109 14.9637L4.4551 14.9637C3.45425 14.9637 2.62021 14.1296 2.62021 13.1288L2.62021 5.78921C2.62021 5.53899 2.87042 5.28878 3.12063 5.28878C3.37085 5.28878 3.62106 5.53899 3.62106 5.78921L3.62106 13.1288C3.62106 13.5458 3.95468 13.9628 4.4551 13.9628L11.2109 13.9628C11.6279 13.9628 12.0449 13.6292 12.0449 13.1288L12.0449 5.78921C12.0449 5.53899 12.2951 5.28878 12.5453 5.28878ZM6.29 6.79006C6.54021 6.79006 6.79043 7.04027 6.79043 7.29049L6.79043 11.8777C6.79043 12.0445 6.70702 12.1279 6.62362 12.2113C6.54021 12.2948 6.3734 12.3782 6.29 12.3782C5.95638 12.3782 5.78957 12.1279 5.78957 11.8777L5.78957 7.29049C5.78957 7.04027 6.03979 6.79006 6.29 6.79006ZM9.37596 6.79006C9.62618 6.79006 9.87639 7.04027 9.87639 7.29049L9.87639 11.8777C9.87639 12.1279 9.62618 12.3782 9.37596 12.3782C9.12575 12.3782 8.87554 12.1279 8.87554 11.8777L8.87554 7.29049C8.87554 7.04027 9.12575 6.79006 9.37596 6.79006ZM9.37596 1.03516C9.95979 1.03516 10.4602 1.36877 10.627 1.8692L11.1275 3.62069L14.13 3.62069C14.3802 3.62069 14.6304 3.87091 14.6304 4.12112C14.6304 4.37133 14.3802 4.62155 14.13 4.62155L1.86957 4.62155C1.61935 4.62155 1.36914 4.37133 1.36914 4.12112C1.36914 3.87091 1.61935 3.62069 1.86957 3.62069L4.78872 3.62069L5.45596 1.8692C5.62277 1.36877 6.12319 1.03516 6.62362 1.03516L9.37596 1.03516ZM9.37596 1.9526L6.70702 1.9526C6.54021 1.9526 6.3734 2.03601 6.3734 2.11941L5.87298 3.53729L10.1266 3.53729L9.70958 2.11941C9.62618 2.03601 9.54277 1.9526 9.37596 1.9526Z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  );
}

function CloseSvgIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12.5821 3.39023C12.7521 3.56023 12.7721 3.83023 12.6421 4.03023L8.69211 7.98023L12.5821 11.8702C12.7921 12.0502 12.8221 12.3602 12.6421 12.5702C12.4621 12.7802 12.1521 12.8102 11.9421 12.6302L7.98211 8.69024L4.09211 12.5802C3.91211 12.7702 3.60211 12.7802 3.41211 12.6002C3.23211 12.4302 3.19211 12.1402 3.33211 11.9402L7.28211 7.98023L3.39211 4.09023C3.21211 3.88023 3.23211 3.57023 3.44211 3.38023C3.60211 3.24023 3.84211 3.22023 4.02211 3.33023L7.98211 7.28023L11.8721 3.39023C12.0621 3.19023 12.3821 3.19023 12.5821 3.39023Z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  );
}

function AddSvgIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8.6002 7.4006V2.59961C8.6002 2.26862 8.33119 1.9996 8.0002 1.9996C7.6682 1.9996 7.40019 2.26862 7.40019 2.59961V7.4006H2.60001C2.269 7.4006 2 7.66861 2 7.9996C2 8.3306 2.269 8.59961 2.60001 8.59961H7.40019V13.4006C7.40019 13.7316 7.6682 13.9996 8.0002 13.9996C8.33119 13.9996 8.6002 13.7316 8.6002 13.4006V8.59961H13.4C13.732 8.59961 14 8.3306 14 7.9996C14 7.66861 13.732 7.4006 13.4 7.4006H8.6002Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function AgentManagementIcon({
  name,
  className,
  preserveOriginalColor = false,
}: {
  name: AgentManagementIconName;
} & IconProps) {
  if (name === 'delete') {
    return <DeleteIcon className={className} />;
  }

  if (name === 'close') {
    return <CloseSvgIcon className={className} />;
  }

  if (name === 'add') {
    return <AddSvgIcon className={className} />;
  }

  const imageClassName = [name === 'edit' && !preserveOriginalColor ? 'brightness-0' : null, className]
    .filter(Boolean)
    .join(' ');
  return <img src={ICON_PATHS[name]} alt="" aria-hidden="true" className={imageClassName} />;
}
