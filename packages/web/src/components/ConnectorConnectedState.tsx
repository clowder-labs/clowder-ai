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
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
        <span className="text-green-600">
          <CheckCircleIcon />
        </span>
        <span className="text-sm font-medium text-green-700">{label}</span>
        <button
          type="button"
          onClick={() => void onDisconnect()}
          disabled={disconnecting}
          className="ml-auto text-xs font-medium text-red-500 transition-colors hover:text-red-700 disabled:opacity-50"
          data-testid={disconnectTestId}
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
      {children}
    </div>
  );
}
