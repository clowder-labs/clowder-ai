/**
 * F241 Phase B Slice 2b P1.5: synchronous TTL refresh on startup/sync.
 *
 * Per F241 doc § Phase B Slice 2b Design Notes (Health timing): when an
 * already-approved capability has health.checkedAt + ttlMs < now, the
 * startup/sync path MUST re-run the health executor synchronously. On
 * success, the refreshed health is persisted and routeable stays true.
 * On failure, `routeable=false` + `lastSyncError` is persisted (the row
 * degrades; operator must re-approve to re-promote).
 *
 * This is the ONLY non-approval code path that may flip routeable from
 * the host side, and it strictly degrades (never promotes false → true,
 * which remains the orchestration service's exclusive privilege —
 * per Q3 S1/S2 convergence).
 */

import type { AgentProviderCapabilityDescriptor, CapabilitiesConfig } from '@cat-cafe/shared';
import type {
  AgentProviderHealthExecutionContext,
  AgentProviderHealthExecutor,
} from './agent-provider-health-executor.js';
import type { RouteableAgentProviderRow } from './agent-provider-projection.js';

export interface RefreshExpiredHealthInputs {
  /** Latest persisted capabilities snapshot. */
  readonly capabilities: CapabilitiesConfig | null;
  /** Pre-filtered list of approved routeable rows (from `listApprovedRouteableRows`). */
  readonly rows: readonly RouteableAgentProviderRow[];
  /** Current epoch ms — injected for testability. */
  readonly now: () => number;
  /** Health executor; same one the orchestration service uses on approval. */
  readonly healthExecutor: AgentProviderHealthExecutor;
  /** Bind the executor to the live transport registry view. */
  readonly getHealthExecutorContext: (
    descriptor: AgentProviderCapabilityDescriptor,
    descriptorHash: string,
  ) => Pick<AgentProviderHealthExecutionContext, 'providerTransportRegistry' | 'now'>;
  /** Persist a mutated capabilities snapshot. */
  readonly persist: (next: CapabilitiesConfig) => Promise<void>;
  /** Optional structured logger. */
  readonly log?: (level: 'info' | 'warn' | 'error', payload: Record<string, unknown>, msg: string) => void;
}

/**
 * Returns the mutated capabilities snapshot if any row was refreshed (so the
 * caller can re-derive its routeable row list). Returns `null` if nothing
 * needed refreshing (caller can keep using the input snapshot).
 */
export async function refreshExpiredHealthInPlace(
  inputs: RefreshExpiredHealthInputs,
): Promise<CapabilitiesConfig | null> {
  if (!inputs.capabilities) return null;
  const now = inputs.now();
  let mutated = false;
  const next = structuredClone(inputs.capabilities);

  for (const row of inputs.rows) {
    const persistedEntry = next.capabilities.find(
      (c) => c.pluginId === row.pluginId && c.id === row.capId && c.type === 'agentProvider' && c.agentProvider,
    );
    if (!persistedEntry || !persistedEntry.agentProvider) continue;

    const descriptor = persistedEntry.agentProvider as AgentProviderCapabilityDescriptor;
    // Only refresh when:
    //  - approval is still live (routeableApproved=true)
    //  - descriptorHash matches (health is still bound to this shape)
    //  - TTL is actually expired
    if (!descriptor.routeableApproved || !descriptor.descriptorHash) continue;
    if (!descriptor.health) continue;
    if (descriptor.health.descriptorHash !== descriptor.descriptorHash) continue;
    if (now <= descriptor.health.checkedAt + descriptor.health.ttlMs) continue;

    const ctx = inputs.getHealthExecutorContext(descriptor, descriptor.descriptorHash);
    let refreshed;
    try {
      refreshed = await inputs.healthExecutor({
        resource: descriptor,
        descriptorHash: descriptor.descriptorHash,
        providerTransportRegistry: ctx.providerTransportRegistry,
        now: ctx.now,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      inputs.log?.(
        'error',
        { pluginId: row.pluginId, capId: row.capId, err: message },
        '[F241] health refresh: executor threw — degrading routeable=false',
      );
      const degradedThrown: AgentProviderCapabilityDescriptor = {
        ...descriptor,
        routeable: false,
        lastSyncError: {
          message: `ttl-refresh-executor-threw: ${message}`,
          occurredAt: now,
        },
      };
      persistedEntry.agentProvider = degradedThrown;
      mutated = true;
      continue;
    }

    if (refreshed.passed) {
      inputs.log?.(
        'info',
        { pluginId: row.pluginId, capId: row.capId },
        '[F241] health refresh: refreshed and still routeable',
      );
      persistedEntry.agentProvider = { ...descriptor, health: refreshed };
      mutated = true;
    } else {
      inputs.log?.(
        'warn',
        {
          pluginId: row.pluginId,
          capId: row.capId,
          failureReason: refreshed.failureReason,
        },
        '[F241] health refresh: failed — degrading routeable=false (approval intent preserved)',
      );
      const degraded: AgentProviderCapabilityDescriptor = {
        ...descriptor,
        routeable: false,
        health: refreshed,
        lastSyncError: {
          message: `ttl-refresh-failed: ${refreshed.failureReason ?? 'unknown'}`,
          occurredAt: now,
        },
      };
      persistedEntry.agentProvider = degraded;
      mutated = true;
    }
  }

  if (!mutated) return null;
  await inputs.persist(next);
  return next;
}
