import { ProviderPluginRegistry } from '@clowder/core';

let registry: ProviderPluginRegistry | null = null;

export function getPluginRegistry(): ProviderPluginRegistry {
  if (!registry) {
    throw new Error('PluginRegistry not initialized. Call initPluginRegistry() first.');
  }
  return registry;
}

export function initPluginRegistry(nextRegistry: ProviderPluginRegistry): void {
  registry = nextRegistry;
}

export function resetPluginRegistry(): void {
  registry = null;
}
