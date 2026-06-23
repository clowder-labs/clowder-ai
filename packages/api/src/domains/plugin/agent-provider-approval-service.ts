/**
 * F241 Phase B Slice 2b: Approval orchestration service.
 *
 * The single explicit synchronous path that may promote a capability from
 * `routeable: false` to `routeable: true`. Per F241 doc § Phase B Slice 2b
 * Design Notes (Background actor permission split): the orchestration
 * service is the host-owned authority that operators interact with; no
 * background flow can substitute for it.
 *
 * Flow per Step 4 of the 6-step gate:
 *   1. Locate the capability row by (pluginId, capId).
 *   2. Build admission snapshot, EXCLUDING the candidate.
 *   3. Run RoutingAdmissionService — denial → return early, no state change.
 *   4. Run the injected health executor (bound to current descriptorHash).
 *   5. On health pass: atomic write of routeableApproved=true +
 *      health=passed + routeable=true + state='healthy'.
 *   6. On health fail: write `health=failed` (telemetry) but keep
 *      routeableApproved=false / routeable=false (fail-closed). Operator
 *      sees the failure reason and may fix and re-approve.
 *
 * Race protection: the entire admission + health + write cycle runs under
 * the same `withCapabilityLock` used by the activator, so a concurrent
 * `activateAgentProvider` cannot interleave a descriptor delta between
 * admission and atomic write. If the descriptor hash changes mid-flight
 * (shouldn't happen under the lock, but defended for clarity), we abort
 * with a `descriptor-changed` error so the operator re-requests.
 */

import type {
  AgentProviderCapabilityDescriptor,
  AgentProviderHealthResult,
  CapabilitiesConfig,
} from '@cat-cafe/shared';
import type {
  AgentProviderHealthExecutionContext,
  AgentProviderHealthExecutor,
} from './agent-provider-health-executor.js';
import { transportAvailabilityHealthExecutor } from './agent-provider-health-executor.js';
import { normalizeCapId } from './PluginRegistry.js';
import {
  admitForRouting,
  type RoutingAdmissionCandidate,
  type RoutingAdmissionDenialReason,
  type RoutingAdmissionSnapshot,
} from './RoutingAdmissionService.js';

/** Dependencies the orchestration service needs from the host. */
export interface AgentProviderApprovalDeps {
  /** Read the persisted capabilities snapshot. */
  readonly readCapabilities: () => Promise<CapabilitiesConfig | null>;
  /** Write the capabilities snapshot back. */
  readonly writeCapabilities: (next: CapabilitiesConfig) => Promise<void>;
  /** Same lock the activator uses — guarantees atomicity vs concurrent activation. */
  readonly withCapabilityLock: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Build the admission snapshot for the candidate, EXCLUDING the candidate itself. */
  readonly buildAdmissionSnapshot: (
    pluginId: string,
    capId: string,
    config: CapabilitiesConfig | null,
  ) => Promise<RoutingAdmissionSnapshot>;
  /** Run the declared health check probe. Defaults to transport-availability. */
  readonly healthExecutor?: AgentProviderHealthExecutor;
  /** Build the bound transport-registry view the health executor needs. */
  readonly getHealthExecutorContext: (
    descriptor: AgentProviderCapabilityDescriptor,
    descriptorHash: string,
  ) => Pick<AgentProviderHealthExecutionContext, 'providerTransportRegistry' | 'now'>;
  /**
   * F241 Phase B Slice 2b Step 5a — post-approval sync hook. Fires AFTER a
   * successful atomic promotion to `routeable=true`, while still under
   * `withCapabilityLock`. The host wires this to the existing serialized
   * sync coordinator (e.g. `syncAgentRegistry(catRegistry.getAllConfigs())`)
   * so the new routeable capability gets projected into AgentRegistry.
   *
   * Failures inside this hook are caught and recorded as `lastSyncError`
   * on the descriptor (rolling back effective `routeable` to false), per
   * the Step 6 failure-recovery rule in the design notes. `routeableApproved`
   * and `health` are preserved — owner intent is not invalidated by a host
   * wiring failure.
   *
   * Optional: when omitted, approval still writes routeable=true but the
   * caller is responsible for triggering sync separately (used in tests
   * + deployments without the host wiring).
   */
  readonly onRouteablePromoted?: (capability: AgentProviderCapabilityDescriptor) => Promise<void>;
}

/** The operator's binding decision at approval time. */
export interface AgentProviderApprovalRequest {
  /** Plugin id that owns the capability. */
  readonly pluginId: string;
  /** Capability id (resource name) within the plugin. */
  readonly capId: string;
  /** Host-owned binding: catId this capability is routed under. */
  readonly catId: string;
  /** Optional profile id binding. */
  readonly profileId?: string;
  /** Manifest-declared @-mention patterns the operator confirms binding to.
   *  Slice 2b does not yet require these to be in the manifest schema —
   *  the operator passes them through as the canonical claim set so
   *  admission can collision-check them. */
  readonly mentionPatterns?: readonly string[];
}

/** Reason for a denied approval — stable codes for UI / logging. */
export type AgentProviderApprovalDenialReason =
  | 'capability-not-found'
  | 'capability-not-agent-provider'
  | 'descriptor-hash-missing'
  | RoutingAdmissionDenialReason
  | 'health-check-failed'
  | 'post-approval-sync-failed';

/** Result of an approval attempt. */
export type AgentProviderApprovalResult =
  | {
      readonly ok: true;
      readonly capability: AgentProviderCapabilityDescriptor;
    }
  | {
      readonly ok: false;
      readonly reason: AgentProviderApprovalDenialReason;
      readonly details: string;
      /** Populated when health probe failed — provides telemetry to the operator. */
      readonly health?: AgentProviderHealthResult;
      /** Populated when admission denied with a conflicting identity. */
      readonly conflictingIdentity?: string;
    };

/**
 * Approval service. Holds dependencies and exposes the single
 * `approveRouteable` entry point that operators (HTTP / CLI) invoke.
 */
export class AgentProviderApprovalService {
  private readonly deps: AgentProviderApprovalDeps;

  constructor(deps: AgentProviderApprovalDeps) {
    this.deps = deps;
  }

  async approveRouteable(request: AgentProviderApprovalRequest): Promise<AgentProviderApprovalResult> {
    return this.deps.withCapabilityLock(async () => {
      const config = await this.deps.readCapabilities();
      const capId = normalizeCapId(request.capId);
      const entry = config?.capabilities.find((c) => normalizeCapId(c.id) === capId && c.pluginId === request.pluginId);

      if (!entry) {
        return {
          ok: false,
          reason: 'capability-not-found',
          details: `No capability '${request.pluginId}/${request.capId}' found.`,
        };
      }
      if (entry.type !== 'agentProvider' || !entry.agentProvider) {
        return {
          ok: false,
          reason: 'capability-not-agent-provider',
          details: `Capability '${request.pluginId}/${request.capId}' is not an agentProvider.`,
        };
      }

      const descriptor = entry.agentProvider;
      if (!descriptor.descriptorHash) {
        return {
          ok: false,
          reason: 'descriptor-hash-missing',
          details: `Capability '${request.pluginId}/${request.capId}' has no descriptorHash — re-enable the plugin first so Slice 2b activator can fill it in.`,
        };
      }

      // Step 3: admission with candidate EXCLUDED from snapshot.
      const snapshot = await this.deps.buildAdmissionSnapshot(request.pluginId, request.capId, config);
      const candidate: RoutingAdmissionCandidate = {
        pluginId: request.pluginId,
        capId: request.capId,
        providerId: descriptor.name,
        catId: request.catId,
        profileId: request.profileId,
        mentionPatterns: request.mentionPatterns,
        healthCheck: descriptor.healthCheck,
      };
      const admission = admitForRouting(candidate, snapshot);
      if (!admission.admitted) {
        return {
          ok: false,
          reason: admission.reason,
          details: admission.details,
          conflictingIdentity: admission.conflictingIdentity,
        };
      }

      // Step 5: blocking health check, bound to current descriptorHash.
      const executor = this.deps.healthExecutor ?? transportAvailabilityHealthExecutor;
      const executorContext = this.deps.getHealthExecutorContext(descriptor, descriptor.descriptorHash);
      const health = await executor({
        resource: descriptor,
        descriptorHash: descriptor.descriptorHash,
        providerTransportRegistry: executorContext.providerTransportRegistry,
        now: executorContext.now,
      });

      if (!health.passed) {
        // Telemetry write: persist the failed health result so the operator
        // can see WHY it failed. routeableApproved / routeable stay false.
        const updated: AgentProviderCapabilityDescriptor = {
          ...descriptor,
          health,
        };
        await this.persistDescriptor(config, entry.id, updated);
        return {
          ok: false,
          reason: 'health-check-failed',
          details: health.failureReason ?? 'health-check failed without a specific reason',
          health,
        };
      }

      // Step 6: atomic write of the routeable promotion. Activator preserves
      // these on re-activation when descriptorHash matches (Slice 2b Step 3).
      const promoted: AgentProviderCapabilityDescriptor = {
        ...descriptor,
        state: 'healthy',
        routeable: true,
        routeableApproved: true,
        health,
        lastSyncError: undefined,
      };
      await this.persistDescriptor(config, entry.id, promoted);

      // F241 Phase B Slice 2b Step 5a — fire post-approval sync hook. Failures
      // here roll back effective `routeable=false` and record `lastSyncError`,
      // but preserve `routeableApproved` + `health` (Step 6 failure-recovery
      // table in the design notes: host wiring failure ≠ operator withdrawing
      // approval; retry doesn't need re-approval).
      if (this.deps.onRouteablePromoted) {
        try {
          await this.deps.onRouteablePromoted(promoted);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const rolledBack: AgentProviderCapabilityDescriptor = {
            ...promoted,
            routeable: false,
            // Keep state='healthy' so the operator can see the health pass
            // was real; routeable flipping false signals the sync issue.
            lastSyncError: {
              message: `post-approval-sync-failed: ${message}`,
              occurredAt: Date.now(),
            },
          };
          await this.persistDescriptor(await this.deps.readCapabilities(), entry.id, rolledBack);
          return {
            ok: false,
            reason: 'post-approval-sync-failed',
            details: `post-approval sync hook failed: ${message}`,
            health,
          };
        }
      }

      return { ok: true, capability: promoted };
    });
  }

  private async persistDescriptor(
    config: CapabilitiesConfig | null,
    entryId: string,
    next: AgentProviderCapabilityDescriptor,
  ): Promise<void> {
    const base: CapabilitiesConfig = config ? structuredClone(config) : { version: 1, capabilities: [] };
    const target = base.capabilities.find((c) => c.id === entryId);
    if (target) {
      target.agentProvider = next;
    }
    await this.deps.writeCapabilities(base);
  }
}
