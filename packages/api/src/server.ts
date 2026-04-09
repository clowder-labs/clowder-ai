/**
 * Clowder API — Programmatic Entry Point
 *
 * Thin factory that allows external consumers to start the server
 * without relying on process.env or the CLI entry point.
 *
 * Usage:
 *   import { createClowderServer } from '@clowder/api/server';
 *   const server = await createClowderServer({ port: 3004 });
 *   await server.start();
 *   // ... later
 *   await server.close();
 */

import type { ClowderProviderPlugin } from '@clowder/core';

export interface ClowderServerOptions {
  /** Server port (default: 3004 or API_SERVER_PORT env) */
  port?: number;
  /** Server host (default: '127.0.0.1' or API_SERVER_HOST env) */
  host?: string;
  /** Redis URL for persistent storage */
  redisUrl?: string;
  /** Use in-memory storage instead of Redis */
  memoryStore?: boolean;
  /** Additional provider plugins to register */
  plugins?: ClowderProviderPlugin[];
  /** Project root directory */
  projectRoot?: string;
}

/**
 * Create and configure a Clowder API server instance.
 *
 * Returns an object with `start()` and `close()` methods.
 * The server is fully configured but NOT yet listening — call `start()` to begin.
 */
export async function createClowderServer(options: ClowderServerOptions = {}): Promise<{
  start: () => Promise<string>;
  close: () => Promise<void>;
}> {
  // Inject options into process.env before importing the server module.
  // This is the thinnest viable wrapper — the server internals read from process.env.
  if (options.port != null) process.env.API_SERVER_PORT = String(options.port);
  if (options.host != null) process.env.API_SERVER_HOST = options.host;
  if (options.redisUrl != null) process.env.REDIS_URL = options.redisUrl;
  if (options.memoryStore) process.env.MEMORY_STORE = '1';
  if (options.projectRoot != null) process.env.CAT_CAFE_PROJECT_ROOT = options.projectRoot;

  // Store extra plugins for the registry to pick up
  if (options.plugins?.length) {
    (globalThis as Record<string, unknown>).__clowder_extra_plugins = options.plugins;
  }

  // Dynamic import to ensure env vars are set before module-level reads
  const { startServer, stopServer } = await import('./server-lifecycle.js');

  return {
    start: () => startServer(),
    close: () => stopServer(),
  };
}
