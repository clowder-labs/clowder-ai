import type { ReactNode } from 'react';

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

function WindowCloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11 5L5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HeaderAction({ title, children }: { title: string; children: ReactNode }) {
  return (
    <button type="button" className="ui-content-header-action" title={title} aria-label={title}>
      {children}
    </button>
  );
}

export function RightContentHeader() {
  return (
    <div className="ui-content-header" data-testid="right-content-header">
      <div aria-hidden="true" />
      <div className="ui-content-header-actions">
        <HeaderAction title="笑脸">
          <WindowSmileIcon />
        </HeaderAction>
        <div className="ui-content-header-divider" data-testid="right-content-header-divider" aria-hidden="true" />
        <HeaderAction title="最小化">
          <WindowMinimizeIcon />
        </HeaderAction>
        <HeaderAction title="最大化">
          <WindowMaximizeIcon />
        </HeaderAction>
        <HeaderAction title="关闭">
          <WindowCloseIcon />
        </HeaderAction>
      </div>
    </div>
  );
}
