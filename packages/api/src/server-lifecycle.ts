/**
 * Server lifecycle hooks — extracted from index.ts for programmatic control.
 *
 * This module is designed to be dynamically imported AFTER env vars are set,
 * so that the module-level PORT/HOST reads pick up the overrides.
 */

import type { FastifyInstance } from 'fastify';

let appInstance: FastifyInstance | null = null;
let shutdownFn: ((signal: string) => Promise<void>) | null = null;

/**
 * Start the API server. Returns the listen address.
 */
export async function startServer(): Promise<string> {
  // Prevent auto-start when we import index.ts
  process.env.__CLOWDER_PROGRAMMATIC = '1';

  const { _startForProgrammatic } = await import('./index.js');
  const result = await _startForProgrammatic();
  appInstance = result.app;
  shutdownFn = result.shutdown;
  return result.address;
}

/**
 * Gracefully stop the server.
 */
export async function stopServer(): Promise<void> {
  if (shutdownFn) {
    await shutdownFn('programmatic');
  } else if (appInstance) {
    await appInstance.close();
  }
}
