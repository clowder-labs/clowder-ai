import type { OfficeClawProviderPlugin } from '@office-claw/core';

export interface OfficeClawServerOptions {
  port?: number;
  host?: string;
  redisUrl?: string;
  memoryStore?: boolean;
  plugins?: OfficeClawProviderPlugin[];
  projectRoot?: string;
}

export async function createOfficeClawServer(options: OfficeClawServerOptions = {}): Promise<{
  start: () => Promise<string>;
  close: () => Promise<void>;
}> {
  if (options.port != null) process.env.API_SERVER_PORT = String(options.port);
  if (options.host != null) process.env.API_SERVER_HOST = options.host;
  if (options.redisUrl != null) process.env.REDIS_URL = options.redisUrl;
  if (options.memoryStore) process.env.MEMORY_STORE = '1';
  if (options.projectRoot != null) process.env.OFFICE_CLAW_CONFIG_ROOT = options.projectRoot;

  if (options.plugins?.length) {
    (globalThis as Record<string, unknown>).__clowder_extra_plugins = options.plugins;
  }

  const { startServer, stopServer } = await import('./server-lifecycle.js');

  return {
    start: () => startServer(),
    close: () => stopServer(),
  };
}
