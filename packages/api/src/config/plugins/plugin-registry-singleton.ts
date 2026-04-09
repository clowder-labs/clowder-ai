/**
 * Global Plugin Registry Singleton
 * Provides module-level access to the ProviderPluginRegistry instance.
 * Initialized at server startup (index.ts), consumed by config modules.
 */

import { ProviderPluginRegistry } from '@clowder/core';

let _registry: ProviderPluginRegistry | null = null;

/** Get the global plugin registry. Throws if not yet initialized. */
export function getPluginRegistry(): ProviderPluginRegistry {
  if (!_registry) {
    throw new Error('PluginRegistry not initialized. Call initPluginRegistry() first.');
  }
  return _registry;
}

/** Initialize (or replace) the global plugin registry. Called once at startup. */
export function initPluginRegistry(registry: ProviderPluginRegistry): void {
  _registry = registry;
}
