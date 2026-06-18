/**
 * F241 Phase A: ACP as a host-owned provider transport.
 *
 * The plugin/provider layer may eventually declare `transport: acp`, but ACP
 * process creation, env injection, MCP exposure, health, and pool lifecycle
 * remain owned by Cat Cafe host code.
 */

import type { FastifyBaseLogger } from 'fastify';
import { getAcpConfig } from '../../../../../../config/cat-config-loader.js';
import type { ProviderTransportFactory } from '../transport/ProviderTransportRegistry.js';
import { type AcpPoolRegistry, createAcpServiceForConfig } from './AcpServiceFactory.js';
import { closeStaleAcpPools } from './acp-pool-registry.js';

export interface AcpProviderTransportFactoryDeps {
  poolRegistry: AcpPoolRegistry;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}

export function createAcpProviderTransportFactory(deps: AcpProviderTransportFactoryDeps): ProviderTransportFactory {
  return {
    id: 'acp',
    async create(input) {
      const acpConfig = getAcpConfig(input.profileId, input.projectRoot);
      if (!acpConfig) return { handled: false };

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
