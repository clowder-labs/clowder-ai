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

import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { tmpdir } from 'node:os';
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

/**
 * F241 Phase C — Real `cliProbe` executor (bounded spawn + exit-code check).
 *
 * Per F241 doc § 2b "Health executor ships as transport-availability probe;
 * real `acpInitialize` (runtime initialize handshake) and `cliProbe` (bounded
 * spawn + exit-code check) probes are tracked as Slice 2c follow-on hardening
 * — the executor is a drop-in DI swap (`AgentProviderHealthExecutor` interface
 * in `agent-provider-health-executor.ts`), no further redesign needed."
 *
 * Semantics:
 *   1. Gate (cheap): run the transport-availability check first. If the host
 *      transport for the declared `healthCheck.type` is not registered, fail
 *      fast WITHOUT spawning — same observable failure as the 2b stub.
 *   2. For `cliProbe`-declared resources: spawn `resource.command --version`
 *      with stdin closed, in `os.tmpdir()`, with a `PATH`-only minimal env.
 *      Bounded by `probeTimeoutMs` (default 10s). Exit code 0 ⇒ passed.
 *      Non-zero ⇒ `cli-probe-nonzero-exit:N`. Spawn error ⇒
 *      `cli-probe-spawn-error:<msg>`. Timeout ⇒ `cli-probe-timeout:Nms` +
 *      `child.kill('SIGTERM')` so a lingering probe doesn't leak.
 *   3. For `acpInitialize`-declared resources: fall through to transport-
 *      availability result — the ACP carrier (F161 PR #899) owns the real
 *      initialize handshake once it lands; spawning a CLI here would be wrong.
 *
 * Why `--version`: standard CLI convention, fast-exit, no side effects, no
 * stdin requirement, no callback config / MCP injection needed. Compatible
 * with clowder-code (verified) and any well-formed CLI runtime. If a future
 * runtime needs a different probe argv, extend `healthCheck` schema with an
 * optional `probeArgs` field (tracked as a separate 2c follow-on; the
 * reference runtime is covered by `--version` today).
 *
 * Why a factory: lets production wiring inject deterministic spawn + a tight
 * timeout in tests, while keeping the default production semantics simple.
 */
export interface RealCliProbeDeps {
  /** Test seam — replaces `node:child_process.spawn` for unit tests. */
  readonly spawnFn?: typeof nodeSpawn;
  /** Override the probe timeout. Default 10s — generous for `--version`
   *  on cold-cache filesystems, tight enough that a hung binary doesn't
   *  block the approval RPC for minutes. */
  readonly probeTimeoutMs?: number;
}

const DEFAULT_CLI_PROBE_TIMEOUT_MS = 10_000;

export function createRealCliProbeHealthExecutor(deps?: RealCliProbeDeps): AgentProviderHealthExecutor {
  const spawnFn = deps?.spawnFn ?? nodeSpawn;
  const probeTimeoutMs = deps?.probeTimeoutMs ?? DEFAULT_CLI_PROBE_TIMEOUT_MS;

  return async (context) => {
    const now = context.now ?? Date.now;
    // Step 1: transport availability gate (same as the 2b stub semantics).
    const gateResult = await transportAvailabilityHealthExecutor(context);
    if (!gateResult.passed) return gateResult;

    // Step 2: only `cliProbe` declarations get a real spawn. `acpInitialize`
    // and any future type fall through to the transport-availability result.
    if (context.resource.healthCheck?.type !== 'cliProbe') return gateResult;

    // Step 3: bounded spawn + exit-code check.
    return new Promise<AgentProviderHealthResult>((resolve) => {
      const spawnOptions: SpawnOptions = {
        cwd: tmpdir(),
        // Minimal env: PATH only. We do NOT inherit cat-cafe callback / MCP
        // credentials into a health probe — the probe must not be able to do
        // anything meaningful with the runtime env. PATH is required so a
        // bare command like `clowder-code` (npm-linked) still resolves.
        env: { PATH: process.env.PATH ?? '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      };
      let child: ChildProcess;
      try {
        child = spawnFn(context.resource.command, ['--version'], spawnOptions);
      } catch (err) {
        resolve({
          passed: false,
          checkedAt: now(),
          ttlMs: DEFAULT_HEALTH_TTL_MS,
          descriptorHash: context.descriptorHash,
          failureReason: `cli-probe-spawn-error:${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }

      let settled = false;
      const finalize = (result: AgentProviderHealthResult): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (!result.passed) {
          // Best-effort cleanup so a hung probe doesn't outlive its own result.
          try {
            child.kill('SIGTERM');
          } catch {
            /* already dead */
          }
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        finalize({
          passed: false,
          checkedAt: now(),
          ttlMs: DEFAULT_HEALTH_TTL_MS,
          descriptorHash: context.descriptorHash,
          failureReason: `cli-probe-timeout:${probeTimeoutMs}ms`,
        });
      }, probeTimeoutMs);

      child.on('error', (err) => {
        finalize({
          passed: false,
          checkedAt: now(),
          ttlMs: DEFAULT_HEALTH_TTL_MS,
          descriptorHash: context.descriptorHash,
          failureReason: `cli-probe-spawn-error:${err.message}`,
        });
      });

      child.on('exit', (code) => {
        if (code === 0) {
          finalize({
            passed: true,
            checkedAt: now(),
            ttlMs: DEFAULT_HEALTH_TTL_MS,
            descriptorHash: context.descriptorHash,
          });
        } else {
          finalize({
            passed: false,
            checkedAt: now(),
            ttlMs: DEFAULT_HEALTH_TTL_MS,
            descriptorHash: context.descriptorHash,
            failureReason: `cli-probe-nonzero-exit:${code}`,
          });
        }
      });
    });
  };
}
