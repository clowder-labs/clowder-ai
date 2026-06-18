/**
 * F241 Phase A: host-owned provider transport registry.
 *
 * Provider transports are selected before the legacy clientId switch. A handled
 * transport with a null service is still terminal: callers must not fall back to
 * a provider-specific branch after a declared transport failed validation.
 */

import type { CatConfig } from '@cat-cafe/shared';
import type { AgentService } from '../../../types.js';

export interface ProviderTransportInput {
  projectRoot: string;
  profileId: string;
  config: CatConfig;
  providerTransport?: unknown;
}

export interface ProviderTransportCreateResult {
  handled: boolean;
  service?: AgentService | null;
}

export type ProviderTransportResolution =
  | { handled: false }
  | { handled: true; transportId: string; service: AgentService | null };

export interface ProviderTransportCloseStaleOptions {
  reason?: string;
  onCloseError?: (err: unknown, transportId: string, profileId: string, reason: string) => void;
}

export interface ProviderTransportFactory {
  readonly id: string;
  create(input: ProviderTransportInput): Promise<ProviderTransportCreateResult>;
  closeStale?(
    activeProfileIds: ReadonlySet<string>,
    options?: ProviderTransportCloseStaleOptions,
  ): Promise<void>;
}

function declaredTransportId(providerTransport: unknown): string | null {
  if (typeof providerTransport !== 'object' || providerTransport === null) return null;
  const transport = (providerTransport as { transport?: unknown }).transport;
  return typeof transport === 'string' && transport.trim().length > 0 ? transport.trim() : null;
}

export function markActiveProviderTransportProfile(
  activeProfileIdsByTransport: Map<string, Set<string>>,
  transportId: string,
  profileId: string,
): void {
  const existing = activeProfileIdsByTransport.get(transportId);
  if (existing) {
    existing.add(profileId);
    return;
  }
  activeProfileIdsByTransport.set(transportId, new Set([profileId]));
}

export class ProviderTransportRegistry {
  private readonly factories = new Map<string, ProviderTransportFactory>();

  register(factory: ProviderTransportFactory): void {
    if (!factory.id.trim()) {
      throw new Error('Provider transport factory id must not be blank');
    }
    if (this.factories.has(factory.id)) {
      throw new Error(`Provider transport factory '${factory.id}' already registered`);
    }
    this.factories.set(factory.id, factory);
  }

  has(transportId: string): boolean {
    return this.factories.has(transportId);
  }

  async createServiceForConfig(input: ProviderTransportInput): Promise<ProviderTransportResolution> {
    if (input.providerTransport !== undefined && input.providerTransport !== null) {
      const transportId = declaredTransportId(input.providerTransport);
      if (!transportId) {
        return { handled: true, transportId: 'invalid', service: null };
      }

      const factory = this.factories.get(transportId);
      if (!factory) {
        return { handled: true, transportId, service: null };
      }

      const result = await factory.create(input);
      return {
        handled: true,
        transportId,
        service: result.handled ? (result.service ?? null) : null,
      };
    }

    for (const factory of this.factories.values()) {
      const result = await factory.create(input);
      if (!result.handled) continue;
      return {
        handled: true,
        transportId: factory.id,
        service: result.service ?? null,
      };
    }
    return { handled: false };
  }

  async closeStale(
    activeProfileIdsByTransport: ReadonlyMap<string, ReadonlySet<string>>,
    options: ProviderTransportCloseStaleOptions = {},
  ): Promise<void> {
    for (const factory of this.factories.values()) {
      if (!factory.closeStale) continue;
      await factory.closeStale(activeProfileIdsByTransport.get(factory.id) ?? new Set<string>(), options);
    }
  }
}
