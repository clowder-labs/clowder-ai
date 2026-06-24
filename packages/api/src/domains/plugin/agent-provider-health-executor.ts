/**
 * F241 Phase B Slice 2b: Host-owned agentProvider health check executor.
 *
 * The activator declares which `healthCheck` type the operator's approval
 * must satisfy (`acpInitialize` / `cliProbe`). This file owns the EXECUTION
 * side — given a candidate descriptor + host transport context, it runs
 * the declared probe and returns a structured `AgentProviderHealthResult`.
 *
 * Per F241 doc § Phase B Slice 2b Design Notes (Health timing):
 *   - On approval: synchronous, blocking. Success → atomic write of
 *     `routeableApproved=true + health.fresh + routeable=true`.
 *   - On TTL expiry during startup/sync: synchronous refresh. Failure →
 *     effective `routeable=false`, log error.
 *   - Background actors NEVER promote `routeable: false → true`; they may
 *     only refresh telemetry / degrade. Enforcing that boundary belongs
 *     to the orchestration service; the executor here is the pure
 *     "run a probe, return a result" primitive.
 *
 * Slice 2b first cut: ships a TRANSPORT-AVAILABILITY probe — confirms
 * the host transport is registered and a service instance can be
 * constructed (best-effort one-shot). Real ACP-initialize / CLI-probe
 * semantics that actually start the runtime and verify a turn round-trip
 * are tracked as Step 4 follow-on hardening. The orchestration service
 * does not care which probe family the executor uses; it only needs the
 * structured `passed` + bound `descriptorHash` it returns.
 */

import type {
  AgentProviderHealthCheckRequest,
  AgentProviderHealthResult,
  PluginAgentProviderResource,
} from '@cat-cafe/shared';
import type { ProviderTransportRegistry } from '../cats/services/agents/providers/transport/ProviderTransportRegistry.js';

/** Inputs to a single health check run. */
export interface AgentProviderHealthExecutionContext {
  /** The descriptor whose `healthCheck` declaration we are honoring. */
  readonly resource: PluginAgentProviderResource;
  /** Canonical descriptor hash; bound into the result so a later descriptor
   *  delta invalidates this health snapshot per the Q3 convergence rule. */
  readonly descriptorHash: string;
  /** Host transport registry (read-only here — the executor does NOT
   *  register/close transports, only inspects availability). */
  readonly providerTransportRegistry: Pick<ProviderTransportRegistry, 'has'>;
  /** Optional clock injection for deterministic tests. */
  readonly now?: () => number;
}

/** Default TTL applied when the executor produces a fresh health result.
 *  15 minutes — long enough that sync-time refresh isn't constant churn,
 *  short enough that a degraded transport can't keep `routeable=true`
 *  indefinitely. Callers may override per-deployment if/when policy lands. */
export const DEFAULT_HEALTH_TTL_MS = 15 * 60 * 1000;

/**
 * Functional shape of a health executor. Pure-ish (no side effects in the
 * default impl; future impls may spawn the runtime — they MUST be host-owned
 * and bounded by timeouts). Returns the structured result the orchestration
 * service writes into the capability row.
 */
export type AgentProviderHealthExecutor = (
  context: AgentProviderHealthExecutionContext,
) => Promise<AgentProviderHealthResult>;

/**
 * Default transport-availability executor. Honors the declared `healthCheck`
 * type only structurally: a declared `acpInitialize` requires the `acp`
 * transport to be registered; `cliProbe` requires the `cli-jsonl` transport.
 *
 * This is intentionally a thin first cut — it lets the rest of the 2b
 * pipeline (orchestration, atomic write, route) be exercised end-to-end
 * with a real `passed` signal. Replacing the executor with a runtime-probing
 * implementation is a drop-in swap via the orchestration service's
 * injectable executor dependency.
 */
export const transportAvailabilityHealthExecutor: AgentProviderHealthExecutor = async (context) => {
  const now = context.now ?? Date.now;
  const declared: AgentProviderHealthCheckRequest | undefined = context.resource.healthCheck;
  if (!declared) {
    return {
      passed: false,
      checkedAt: now(),
      ttlMs: DEFAULT_HEALTH_TTL_MS,
      descriptorHash: context.descriptorHash,
      failureReason: 'no-healthcheck-declared',
    };
  }

  const requiredTransport = healthCheckTypeToTransport(declared.type);
  if (requiredTransport && !context.providerTransportRegistry.has(requiredTransport)) {
    return {
      passed: false,
      checkedAt: now(),
      ttlMs: DEFAULT_HEALTH_TTL_MS,
      descriptorHash: context.descriptorHash,
      failureReason: `transport-not-registered:${requiredTransport}`,
    };
  }

  if (!context.providerTransportRegistry.has(context.resource.transport)) {
    return {
      passed: false,
      checkedAt: now(),
      ttlMs: DEFAULT_HEALTH_TTL_MS,
      descriptorHash: context.descriptorHash,
      failureReason: `descriptor-transport-not-registered:${context.resource.transport}`,
    };
  }

  return {
    passed: true,
    checkedAt: now(),
    ttlMs: DEFAULT_HEALTH_TTL_MS,
    descriptorHash: context.descriptorHash,
  };
};

/**
 * Map a declared `healthCheck.type` to the host transport that must be
 * registered for the probe to be meaningful. `acpInitialize` corresponds
 * to the ACP transport; `cliProbe` corresponds to `cli-jsonl`.
 */
function healthCheckTypeToTransport(type: AgentProviderHealthCheckRequest['type']): string | null {
  switch (type) {
    case 'acpInitialize':
      return 'acp';
    case 'cliProbe':
      return 'cli-jsonl';
    default:
      return null;
  }
}
