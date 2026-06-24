/**
 * F241 Phase B Slice 2b Step 5b: Routeable agentProvider projection.
 *
 * Turns persisted routeable agentProvider capabilities into synthetic
 * `CatConfig` entries that `syncAgentRegistry` consumes, so a freshly-approved
 * plugin agentProvider actually becomes `@`-able at runtime.
 *
 * Red line (per F241 doc § Phase B Slice 2b Design Notes —
 * RoutingAdmissionService): admission MUST run again here before the
 * synthetic config is injected into the runtime configs map. Skipping this
 * re-introduces parsing-order self-exemption — the exact hole Slice 1 closed.
 *
 * A capability is projected when ALL of:
 *   - `routeable === true` (so admission + health passed at approval time)
 *   - `routeableApproved === true` (explicit operator action)
 *   - `routeableBinding` is present (operator chose a catId)
 *   - `health` is fresh (not expired by TTL)
 *   - admission RE-RUNS green on the current snapshot
 *
 * Otherwise the capability is skipped silently — the operator can re-approve
 * to fix it. The projection NEVER promotes — that's the orchestration
 * service's exclusive privilege.
 */

import type { AgentProviderCapabilityDescriptor, CapabilitiesConfig, CatConfig } from '@cat-cafe/shared';
import {
  admitForRouting,
  type RoutingAdmissionCandidate,
  type RoutingAdmissionSnapshot,
} from './RoutingAdmissionService.js';

export interface RouteableAgentProviderRow {
  readonly pluginId: string;
  readonly capId: string;
  readonly descriptor: AgentProviderCapabilityDescriptor;
}

/**
 * Pull every capability row that the operator has approved as routeable.
 * Pre-projection filter — the projection function additionally re-runs
 * admission and checks health freshness.
 */
export function listApprovedRouteableRows(capabilities: CapabilitiesConfig | null): RouteableAgentProviderRow[] {
  if (!capabilities) return [];
  const out: RouteableAgentProviderRow[] = [];
  for (const cap of capabilities.capabilities) {
    if (cap.type !== 'agentProvider' || !cap.agentProvider) continue;
    const d = cap.agentProvider as AgentProviderCapabilityDescriptor;
    if (!d.routeable || !d.routeableApproved) continue;
    if (!d.routeableBinding) continue;
    if (!cap.pluginId) continue;
    out.push({ pluginId: cap.pluginId, capId: cap.id, descriptor: d });
  }
  return out;
}

export interface AgentProviderProjectionInputs {
  readonly rows: readonly RouteableAgentProviderRow[];
  /** Build admission snapshot for the given candidate (must EXCLUDE the candidate). */
  readonly buildSnapshot: (pluginId: string, capId: string) => RoutingAdmissionSnapshot;
  /** Current epoch ms — injected for testability. */
  readonly now: () => number;
  /** Optional logger for skip reasons. */
  readonly onSkip?: (pluginId: string, capId: string, reason: string) => void;
}

export interface AgentProviderProjectionResult {
  /** Synthetic CatConfig entries safe to merge into syncAgentRegistry's configs map. */
  readonly configs: Record<string, CatConfig>;
  /** Capabilities that passed all projection gates. */
  readonly admitted: RouteableAgentProviderRow[];
  /** Capabilities skipped, with reason — useful for telemetry/log. */
  readonly skipped: Array<{ pluginId: string; capId: string; reason: string }>;
}

/**
 * Build the synthetic CatConfig map. Pure, side-effect free (except onSkip logging).
 * Caller owns merging the result into `syncAgentRegistry(configs)`.
 */
export function projectRouteableAgentProviders(inputs: AgentProviderProjectionInputs): AgentProviderProjectionResult {
  const configs: Record<string, CatConfig> = {};
  const admitted: RouteableAgentProviderRow[] = [];
  const skipped: Array<{ pluginId: string; capId: string; reason: string }> = [];
  const now = inputs.now();

  for (const row of inputs.rows) {
    const { descriptor } = row;
    const binding = descriptor.routeableBinding;
    if (!binding) {
      skipped.push({ pluginId: row.pluginId, capId: row.capId, reason: 'missing-binding' });
      inputs.onSkip?.(row.pluginId, row.capId, 'missing-binding');
      continue;
    }

    // Health freshness gate — TTL expired means routeable can no longer be
    // trusted (per Q3 convergence). The orchestration service is the only
    // path that can re-promote; here we degrade silently.
    if (!descriptor.health || !descriptor.health.passed) {
      skipped.push({ pluginId: row.pluginId, capId: row.capId, reason: 'health-not-fresh-or-failed' });
      inputs.onSkip?.(row.pluginId, row.capId, 'health-not-fresh-or-failed');
      continue;
    }
    if (descriptor.health.descriptorHash !== descriptor.descriptorHash) {
      skipped.push({ pluginId: row.pluginId, capId: row.capId, reason: 'health-descriptor-mismatch' });
      inputs.onSkip?.(row.pluginId, row.capId, 'health-descriptor-mismatch');
      continue;
    }
    if (now > descriptor.health.checkedAt + descriptor.health.ttlMs) {
      skipped.push({ pluginId: row.pluginId, capId: row.capId, reason: 'health-ttl-expired' });
      inputs.onSkip?.(row.pluginId, row.capId, 'health-ttl-expired');
      continue;
    }

    // Red line: re-run admission on the live snapshot before injecting.
    const snapshot = inputs.buildSnapshot(row.pluginId, row.capId);
    const candidate: RoutingAdmissionCandidate = {
      pluginId: row.pluginId,
      capId: row.capId,
      providerId: descriptor.name,
      catId: binding.catId,
      profileId: binding.profileId,
      mentionPatterns: binding.mentionPatterns,
      healthCheck: descriptor.healthCheck,
    };
    const admission = admitForRouting(candidate, snapshot);
    if (!admission.admitted) {
      skipped.push({
        pluginId: row.pluginId,
        capId: row.capId,
        reason: `admission-rerun-denied:${admission.reason}`,
      });
      inputs.onSkip?.(row.pluginId, row.capId, `admission-rerun-denied:${admission.reason}`);
      continue;
    }

    // All gates green — build the synthetic CatConfig.
    configs[binding.catId] = synthesizeCatConfig(row, binding);
    admitted.push(row);
  }

  return { configs, admitted, skipped };
}

/**
 * Build a synthetic CatConfig from a routeable agentProvider row + binding.
 * The config flows into ProviderTransportRegistry.createServiceForConfig
 * via the existing syncAgentRegistry loop, which already understands the
 * `providerTransport` shape from Slice 1.
 */
function synthesizeCatConfig(
  row: RouteableAgentProviderRow,
  binding: NonNullable<AgentProviderCapabilityDescriptor['routeableBinding']>,
): CatConfig {
  const d = row.descriptor;
  // Mark synthetic origins so loaders / debugging can distinguish plugin-projected
  // configs from operator-authored ones. We do NOT route through the clientId
  // switch — the ProviderTransportRegistry handler runs BEFORE that switch
  // (per Slice 1 design), so a synthetic providerTransport entry is sufficient.
  // CatConfig is a branded structural type with many required fields whose
  // values are not meaningful for synthetic plugin-projected entries; fill
  // them with manifest-derived defaults so any consumer that does inspect
  // them sees something stable + auditable rather than `undefined`.
  const synthetic = {
    id: binding.catId,
    name: d.name,
    displayName: d.name,
    avatar: '🧩',
    color: 'gray',
    mentionPatterns: [...(binding.mentionPatterns ?? [])],
    clientId: d.name,
    defaultModel: '',
    mcpSupport: true,
    roleDescription: `Plugin-projected agentProvider (${row.pluginId}/${row.capId})`,
    personality: '',
    providerTransport: {
      transport: d.transport,
      command: d.command,
      startupArgs: [...d.startupArgs],
      ...(d.resumeArgs ? { resumeArgs: [...d.resumeArgs] } : {}),
      ...(d.sessionPolicy ? { sessionPolicy: d.sessionPolicy } : {}),
      ...(d.outputProfile ? { outputProfile: d.outputProfile } : {}),
      ...(d.timeoutMs !== undefined ? { timeoutMs: d.timeoutMs } : {}),
    },
    pluginProjection: {
      pluginId: row.pluginId,
      capId: row.capId,
      descriptorHash: d.descriptorHash,
    },
  };
  return synthetic as unknown as CatConfig;
}
