'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { useDesktopWindowControls } from '@/hooks/useDesktopWindowControls';

function WindowSmileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6.1" cy="6.6" r="0.7" fill="currentColor" />
      <circle cx="9.9" cy="6.6" r="0.7" fill="currentColor" />
      <path d="M5.5 9.2C6.1 10.1 7 10.6 8 10.6C9 10.6 9.9 10.1 10.5 9.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function WindowMinimizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4 8H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function WindowMaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function WindowRestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5.75 4.25H10.1C10.984 4.25 11.7 4.966 11.7 5.85V10.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.25 5.75H5.9C5.016 5.75 4.3 6.466 4.3 7.35V11.1C4.3 11.984 5.016 12.7 5.9 12.7H10.25C11.134 12.7 11.85 11.984 11.85 11.1V7.35C11.85 6.466 11.134 5.75 10.25 5.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function WindowCloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11 5L5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HeaderAction({
  title,
  children,
  onClick,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="ui-content-header-action"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function RightContentHeader() {
  const { isMaximized, canMaximize, minimize, toggleMaximize, close } = useDesktopWindowControls();
  const maximizeTitle = isMaximized ? '还原' : '最大化';

  return (
    <div className="ui-content-header" data-testid="right-content-header">
      <div aria-hidden="true" />
      <div className="ui-content-header-actions">
        <HeaderAction title="笑脸">
          <WindowSmileIcon />
        </HeaderAction>
        <div className="ui-content-header-divider" data-testid="right-content-header-divider" aria-hidden="true" />
        <HeaderAction title="最小化" onClick={minimize}>
          <WindowMinimizeIcon />
        </HeaderAction>
        <HeaderAction title={maximizeTitle} onClick={toggleMaximize} disabled={!canMaximize}>
          {isMaximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
        </HeaderAction>
        <HeaderAction title="关闭" onClick={close}>
          <WindowCloseIcon />
        </HeaderAction>
      </div>
    </div>
  );
}
