/**
 * F241 Phase A: ACP as a host-owned provider transport.
 *
 * The plugin/provider layer may eventually declare `transport: acp`, but ACP
 * process creation, env injection, MCP exposure, health, and pool lifecycle
 * remain owned by Cat Cafe host code.
 */

import type { FastifyBaseLogger } from 'fastify';
import { type AcpVariantConfig, getAcpConfig } from '../../../../../../config/cat-config-loader.js';
import type { ProviderTransportFactory } from '../transport/ProviderTransportRegistry.js';
import { type AcpPoolRegistry, createAcpServiceForConfig } from './AcpServiceFactory.js';
import { closeStaleAcpPools } from './acp-pool-registry.js';

export interface AcpProviderTransportFactoryDeps {
  poolRegistry: AcpPoolRegistry;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}

function parseDeclaredAcpConfig(providerTransport: unknown): { declared: boolean; config?: AcpVariantConfig } {
  if (typeof providerTransport !== 'object' || providerTransport === null) return { declared: false };
  const raw = providerTransport as Record<string, unknown>;
  if (raw.transport !== 'acp') return { declared: false };
  if (typeof raw.command !== 'string' || raw.command.trim().length === 0) return { declared: true };
  if (!Array.isArray(raw.startupArgs) || !raw.startupArgs.every((arg) => typeof arg === 'string')) {
    return { declared: true };
  }
  const config: AcpVariantConfig = {
    command: raw.command,
    startupArgs: raw.startupArgs,
  };
  if (raw.wireTransport === 'stdio' || raw.wireTransport === 'httpstream') {
    config.transport = raw.wireTransport;
  } else if (raw.acpTransport === 'stdio' || raw.acpTransport === 'httpstream') {
    config.transport = raw.acpTransport;
  }
  if (raw.experimental === true) config.experimental = true;
  if (Array.isArray(raw.mcpWhitelist) && raw.mcpWhitelist.every((name) => typeof name === 'string')) {
    config.mcpWhitelist = raw.mcpWhitelist;
  }
  if (typeof raw.supportsMultiplexing === 'boolean') config.supportsMultiplexing = raw.supportsMultiplexing;
  if (typeof raw.pool === 'object' && raw.pool !== null) {
    const pool = raw.pool as Record<string, unknown>;
    config.pool = {};
    if (typeof pool.maxLiveProcesses === 'number') config.pool.maxLiveProcesses = pool.maxLiveProcesses;
    if (typeof pool.idleTtlMs === 'number') config.pool.idleTtlMs = pool.idleTtlMs;
  }
  return { declared: true, config };
}

export function createAcpProviderTransportFactory(deps: AcpProviderTransportFactoryDeps): ProviderTransportFactory {
  return {
    id: 'acp',
    async create(input) {
      const declared = parseDeclaredAcpConfig(input.providerTransport);
      const acpConfig = declared.declared ? declared.config : getAcpConfig(input.profileId, input.projectRoot);
      if (!acpConfig) return { handled: declared.declared, service: null };

      const service = await createAcpServiceForConfig({
        projectRoot: input.projectRoot,
        profileId: input.profileId,
        config: input.config,
        acpConfig,
        poolRegistry: deps.poolRegistry,
        log: deps.log,
      });

      return { handled: true, service };
    },
    async closeStale(activeProfileIds, options) {
      await closeStaleAcpPools(deps.poolRegistry, activeProfileIds, {
        reason: options?.reason,
        onCloseError: (err, profileId, reason) => options?.onCloseError?.(err, 'acp', profileId, reason),
      });
    },
  };
}
