/**
 * F241 Phase B Slice 2b: Canonical descriptor hash for agentProvider capability rows.
 *
 * Computed by the activator on every upsert. When the hash differs from the
 * existing capability row's stored hash, the activator MUST reset
 * `routeableApproved=false`, invalidate `health`, and clear `lastSyncError`.
 * The operator must then re-approve through the explicit synchronous path
 * (see F241 doc § Phase B Slice 2b Design Notes — Background actor permission split).
 *
 * The hash schema is versioned (v: 1). Future extensions (e.g. plugin
 * fingerprint integration, routeable identity claim fields once the manifest
 * schema gains them) bump the schema version so older hashes don't silently
 * collide with the new shape.
 */

import { createHash } from 'node:crypto';
import type { PluginAgentProviderResource } from '@cat-cafe/shared';

/**
 * Inputs that contribute to the agentProvider descriptor hash. The hash MUST
 * change when any of these fields change, because each one materially affects
 * the runtime behavior of the routeable cat (security, capability, identity).
 */
export interface AgentProviderDescriptorHashInputs {
  /** Plugin id that owns the capability row. */
  readonly pluginId: string;
  /** Capability id (resource name) within the plugin — i.e. the canonical capId. */
  readonly capId: string;
  /** The 2a manifest-side descriptor fields. */
  readonly resource: PluginAgentProviderResource;
  /**
   * Optional plugin/package fingerprint (npm tarball hash, git SHA). If
   * provided, the hash changes when the plugin body mutates, even with an
   * identical manifest. Tracked as F241 follow-on hardening; pass `undefined`
   * in 2b when no fingerprint source is wired yet.
   */
  readonly pluginFingerprint?: string;
}

/**
 * Compute the canonical sha256 descriptor hash for an agentProvider capability.
 *
 * Determinism rules:
 *   - All keys appear in a fixed order via the explicit object literal below.
 *   - Optional fields are normalized to `null` (never omitted) so absence vs.
 *     presence is distinguishable from "field missing on read".
 *   - Array fields with set-semantics (e.g. `mcpWhitelistRequest`) are sorted.
 *     Positional arrays (`startupArgs`, `resumeArgs`) preserve insertion order.
 */
export function computeAgentProviderDescriptorHash(inputs: AgentProviderDescriptorHashInputs): string {
  const r = inputs.resource;
  const canonical = {
    v: 1 as const,
    pluginId: inputs.pluginId,
    capId: inputs.capId,
    transport: r.transport,
    command: r.command,
    startupArgs: [...r.startupArgs],
    resumeArgs: r.resumeArgs ? [...r.resumeArgs] : null,
    sessionPolicy: r.sessionPolicy ?? null,
    outputProfile: r.outputProfile ?? null,
    timeoutMs: r.timeoutMs ?? null,
    mcpWhitelistRequest: r.mcpWhitelistRequest ? [...r.mcpWhitelistRequest].slice().sort() : null,
    sandboxRequest: r.sandboxRequest ?? null,
    healthCheck: r.healthCheck ?? null,
    pluginFingerprint: inputs.pluginFingerprint ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
