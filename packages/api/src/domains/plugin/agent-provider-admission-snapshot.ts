/**
 * F241 Phase B Slice 2b: Default builder for RoutingAdmission snapshots.
 *
 * The snapshot is what `RoutingAdmissionService.admitForRouting` consumes.
 * Per F241 doc § Phase B Slice 2b Design Notes (RoutingAdmissionService),
 * the snapshot must:
 *   - Include the template baseline (`cat-template.json` builtin ids),
 *     mirroring Slice 1's reserved derivation pattern.
 *   - Include identities currently in use by routeable agentProvider
 *     capabilities, EXCLUDING the candidate (so a re-approval of an
 *     already-routeable capability doesn't self-collide).
 *   - Include active non-providerTransport cat ids (Slice 1 pattern parity).
 *
 * Lives in its own file so the route wiring stays thin and the snapshot
 * derivation can be unit-tested independently of the orchestration loop.
 */

import type { AgentProviderCapabilityDescriptor, CapabilitiesConfig, CatConfig } from '@cat-cafe/shared';
import { normalizeCapId } from './PluginRegistry.js';
import type { RoutingAdmissionSnapshot } from './RoutingAdmissionService.js';

export interface AgentProviderAdmissionSnapshotInputs {
  /** Capability config snapshot (the source of existing routeable identities). */
  readonly capabilitiesConfig: CapabilitiesConfig | null;
  /** Active cat configs (the source of active-cat identity collisions). */
  readonly activeCatConfigs: Readonly<Record<string, CatConfig>>;
  /** Cat-template baseline ids — provided by host loader, mirrors Slice 1 input. */
  readonly templateBaselineIds: ReadonlySet<string>;
  /** Returns true if the given cat id has a `providerTransport` config —
   *  such ids are NOT counted as "active non-providerTransport" candidates
   *  (Slice 1 parity: providerTransport candidates can be reclaimed by 2b). */
  readonly hasProviderTransportConfig: (catId: string) => boolean;
  /** The candidate being admitted — its identities are EXCLUDED so a
   *  re-approval (descriptor unchanged) doesn't self-collide. */
  readonly candidatePluginId: string;
  readonly candidateCapId: string;
}

/**
 * Build a complete admission snapshot for the candidate. Pure-ish: only
 * reads from the provided inputs, no I/O. The host wiring (`index.ts`)
 * supplies the inputs via existing accessors (`catRegistry.getAllConfigs`,
 * `getTemplateBuiltinCatIds`, `getProviderTransportConfig`, ...).
 */
export function buildAgentProviderAdmissionSnapshot(
  inputs: AgentProviderAdmissionSnapshotInputs,
): RoutingAdmissionSnapshot {
  const candidateCapIdNormalized = normalizeCapId(inputs.candidateCapId);

  // P1.3 fix: collect ALL identity surfaces of existing routeable agentProviders,
  // not just the descriptor name. Two plugins must not be able to claim the same
  // routeableBinding catId / profileId / mentionPatterns even if their `name`
  // fields differ.
  const existingRouteableIdentities = new Set<string>();
  for (const cap of inputs.capabilitiesConfig?.capabilities ?? []) {
    if (cap.type !== 'agentProvider' || !cap.agentProvider) continue;
    // Skip the candidate itself — Slice 1 red line: never let the snapshot
    // include the row currently being admitted, or the admission self-collides.
    if (cap.pluginId === inputs.candidatePluginId && normalizeCapId(cap.id) === candidateCapIdNormalized) {
      continue;
    }
    const descriptor = cap.agentProvider as AgentProviderCapabilityDescriptor;
    if (!descriptor.routeable) continue;
    if (descriptor.name) existingRouteableIdentities.add(descriptor.name);
    const binding = descriptor.routeableBinding;
    if (binding) {
      if (binding.catId) existingRouteableIdentities.add(binding.catId);
      if (binding.profileId) existingRouteableIdentities.add(binding.profileId);
      for (const pattern of binding.mentionPatterns ?? []) {
        if (pattern) existingRouteableIdentities.add(pattern);
      }
    }
  }

  // P1.3 fix: include active cats' mentionPatterns (and id) so a plugin cannot
  // claim @opus / @sonnet / @opus47 alias of a real cat just because the
  // mentionPattern doesn't match the cat id literally.
  const activeNonProviderTransportIdentities = new Set<string>();
  for (const [id, config] of Object.entries(inputs.activeCatConfigs)) {
    if (inputs.hasProviderTransportConfig(id)) continue;
    activeNonProviderTransportIdentities.add(id);
    for (const pattern of config.mentionPatterns ?? []) {
      if (pattern) activeNonProviderTransportIdentities.add(pattern);
    }
  }

  return {
    templateBaselineIds: new Set(inputs.templateBaselineIds),
    existingRouteableIdentities,
    activeNonProviderTransportIdentities,
  };
}
