import type { BleHelperProcess } from './BleHelperProcess.js';

export type BleHelperClientState = 'idle' | 'starting' | 'ready' | 'degraded' | 'unsupported';

export interface BleHelperClientStatus {
  state: BleHelperClientState;
  reason: string | null;
  restartAttempts: number;
}

export interface BleHelperLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface BleHelperClientOptions {
  platform?: NodeJS.Platform | string;
  spawnProcess?: () => BleHelperProcess;
  helperPath?: string;
  handshakeTimeoutMs?: number;
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: BleHelperLogger;
}
