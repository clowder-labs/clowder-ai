'use client';

import type { ReactNode } from 'react';
import { CheckCircleIcon } from './HubConfigIcons';

interface ConnectorConnectedStateProps {
  label: string;
  disconnecting: boolean;
  onDisconnect: () => void | Promise<void>;
  disconnectTestId: string;
  children?: ReactNode;
}

export function ConnectorConnectedState({
  label,
  disconnecting,
  onDisconnect,
  disconnectTestId,
  children,
}: ConnectorConnectedStateProps) {
  return (
    <div className="space-y-2">
      <div
        className="flex h-[34px] w-1/2 items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--tag-bg)] px-3 text-xs text-[var(--text-primary)]"
        data-testid="connector-connected-pill"
      >
        <span className="shrink-0 text-[var(--state-success-text)]">
          <CheckCircleIcon />
        </span>
        <span className="min-w-0 truncate">{label}</span>
        <button
          type="button"
          onClick={() => void onDisconnect()}
          disabled={disconnecting}
          className="ml-auto shrink-0 font-medium text-[var(--text-accent)] disabled:opacity-50"
          data-testid={disconnectTestId}
        >
          {disconnecting ? '断开中...' : '断开连接'}
        </button>
      </div>
      {children}
    </div>
  );
}
