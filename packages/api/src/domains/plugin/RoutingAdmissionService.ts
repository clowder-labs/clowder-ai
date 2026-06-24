/**
 * F241 Phase B Slice 2b: Routing admission service.
 *
 * Pure function that decides whether a candidate agentProvider capability is
 * eligible to be promoted to `routeable: true`. Called by two paths
 * (per F241 doc § Phase B Slice 2b Design Notes):
 *
 *   - owner approval path (early UX failure before persisting approval)
 *   - syncAgentRegistry projection path (re-validate before injecting
 *     synthetic cat-config into runtime maps)
 *
 * RED LINE: callers MUST compute the snapshot with the candidate explicitly
 * excluded. Failing to do so re-introduces the parsing-order self-exemption
 * hole that Slice 1 closed in ProviderTransportRegistry.
 *
 * The function is intentionally side-effect free and snapshot-driven. It
 * does NOT read cat-config / capability store / template files on its own —
 * the caller owns the snapshot construction. This keeps admission
 * deterministic, testable, and re-runnable inside the serialized sync
 * coordinator without surprising I/O.
 */

import type { AgentProviderHealthCheckRequest } from '@cat-cafe/shared';

/**
 * Routeable identity claims the candidate wants to bind.
 *
 * Combines manifest declarations (providerId, mentionPatterns) with the
 * host's binding decision (catId / profileId) made at approval time. The
 * design treats `catId` as host-owned binding, decoupled from manifest;
 * the caller is responsible for merging the operator-chosen binding with
 * the manifest-declared claims into this candidate.
 */
export interface RoutingAdmissionCandidate {
  /** Plugin id that owns the capability row. */
  readonly pluginId: string;
  /** Capability id (resource name) within the plugin. */
  readonly capId: string;
  /** Manifest claim: provider identifier (e.g. 'clowder-code'). */
  readonly providerId: string;
  /** Host binding: catId routed to this provider. */
  readonly catId: string;
  /** Optional: profile id binding. */
  readonly profileId?: string;
  /** Manifest claim: @-mention patterns the provider responds to. */
  readonly mentionPatterns?: readonly string[];
  /**
   * Health check declaration from the descriptor. Routeable admission
   * REQUIRES this present — there is no default probe substitute.
   */
  readonly healthCheck?: AgentProviderHealthCheckRequest;
}

/**
 * Snapshot of the host's current routeable identity universe, computed
 * EXCLUDING the candidate. Mirrors Slice 1's pattern in
 * `deriveReservedProviderTransportIdentities`: template baseline +
 * non-providerTransport active profiles, plus existing routeable plugins.
 */
export interface RoutingAdmissionSnapshot {
  /**
   * Built-in cat IDs derived from `cat-template.json`. These are the
   * reserved baseline — a plugin can never claim one of these.
   */
  readonly templateBaselineIds: ReadonlySet<string>;
  /**
   * Routeable identities (catId / providerId / profileId / mentionPatterns)
   * already in use by other routeable agentProvider capabilities. The
   * candidate's own identities MUST NOT appear here — callers must
   * explicitly exclude the candidate when building this set.
   */
  readonly existingRouteableIdentities: ReadonlySet<string>;
  /**
   * Cat IDs from cat-config that are active and NOT providerTransport
   * candidates. Mirrors Slice 1's filter: anything currently routeable
   * through the legacy / builtin path cannot be re-claimed by a plugin.
   */
  readonly activeNonProviderTransportIdentities: ReadonlySet<string>;
}

/** Denial reason — keep stable so callers can branch on it for UI / logging. */
export type RoutingAdmissionDenialReason =
  | 'missing-health-check'
  | 'invalid-identity-claim'
  | 'reserved-baseline-collision'
  | 'existing-routeable-collision'
  | 'active-cat-collision';

/** Admission result — either admitted, or denied with a structured reason. */
export type RoutingAdmissionResult =
  | { readonly admitted: true }
  | {
      readonly admitted: false;
      readonly reason: RoutingAdmissionDenialReason;
      /** Specific identity string that caused the collision (when applicable). */
      readonly conflictingIdentity?: string;
      /** Short human-readable explanation suitable for admin UI / logs. */
      readonly details: string;
    };

/**
 * Decide whether the candidate may be promoted to `routeable: true`.
 *
 * Order of checks is deliberate: cheapest / most-fundamental first.
 *
 *   1. healthCheck must be declared (Step 5 admission precondition).
 *   2. At least one identity claim must be present.
 *   3. No claim may collide with the reserved template baseline.
 *   4. No claim may collide with an existing routeable agentProvider identity.
 *   5. No claim may collide with an active non-providerTransport cat.
 *
 * Returns the first failure encountered; a fully admitted candidate
 * returns `{ admitted: true }`.
 */
export function admitForRouting(
  candidate: RoutingAdmissionCandidate,
  snapshot: RoutingAdmissionSnapshot,
): RoutingAdmissionResult {
  if (!candidate.healthCheck) {
    return {
      admitted: false,
      reason: 'missing-health-check',
      details: `Candidate ${candidate.pluginId}/${candidate.capId} requires a declared healthCheck to be routeable; none provided.`,
    };
  }

  const claims = collectIdentityClaims(candidate);
  if (claims.length === 0) {
    return {
      admitted: false,
      reason: 'invalid-identity-claim',
      details: `Candidate ${candidate.pluginId}/${candidate.capId} has no routeable identity claims (providerId / catId / profileId / mentionPatterns).`,
    };
  }

  for (const claim of claims) {
    if (snapshot.templateBaselineIds.has(claim)) {
      return {
        admitted: false,
        reason: 'reserved-baseline-collision',
        conflictingIdentity: claim,
        details: `Identity '${claim}' is reserved by the cat-template baseline and cannot be claimed by a plugin.`,
      };
    }
  }

  for (const claim of claims) {
    if (snapshot.existingRouteableIdentities.has(claim)) {
      return {
        admitted: false,
        reason: 'existing-routeable-collision',
        conflictingIdentity: claim,
        details: `Identity '${claim}' is already claimed by another routeable agentProvider capability.`,
      };
    }
  }

  for (const claim of claims) {
    if (snapshot.activeNonProviderTransportIdentities.has(claim)) {
      return {
        admitted: false,
        reason: 'active-cat-collision',
        conflictingIdentity: claim,
        details: `Identity '${claim}' is already in use by an active cat that is not a providerTransport candidate.`,
      };
    }
  }

  return { admitted: true };
}

/**
 * Collect distinct, non-empty identity claims from the candidate. Order is
 * stable (providerId, catId, profileId, mentionPatterns[]) so that
 * `conflictingIdentity` in the denial result is reproducible.
 */
function collectIdentityClaims(candidate: RoutingAdmissionCandidate): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (value: string | undefined): void => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  };
  push(candidate.providerId);
  push(candidate.catId);
  push(candidate.profileId);
  for (const pattern of candidate.mentionPatterns ?? []) {
    push(pattern);
  }
  return ordered;
}
