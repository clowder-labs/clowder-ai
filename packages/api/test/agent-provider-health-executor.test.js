/**
 * F241 Phase C — Real cliProbe health executor tests.
 *
 * Covers the bounded-spawn + exit-code semantics that replace the 2b
 * transport-availability stub for `cliProbe`-declared resources. `acpInitialize`
 * still falls through to transport-availability until F161 ACP carrier lands.
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

const { transportAvailabilityHealthExecutor, createRealCliProbeHealthExecutor, DEFAULT_HEALTH_TTL_MS } = await import(
  '../dist/domains/plugin/agent-provider-health-executor.js'
);

const REGISTRY_HAS_CLI_JSONL = { has: (id) => id === 'cli-jsonl' };
const REGISTRY_HAS_NOTHING = { has: () => false };

function makeResource(overrides = {}) {
  return {
    name: 'clowder-code',
    transport: 'cli-jsonl',
    command: '/usr/bin/true',
    startupArgs: ['--json'],
    healthCheck: { type: 'cliProbe' },
    ...overrides,
  };
}

function makeContext(resourceOverrides = {}, registry = REGISTRY_HAS_CLI_JSONL) {
  return {
    resource: makeResource(resourceOverrides),
    descriptorHash: 'hash-A',
    providerTransportRegistry: registry,
    now: () => 12_345,
  };
}

/**
 * Fake `spawn` returning a controllable ChildProcess-like emitter. The caller
 * triggers `emit('exit', code)` / `emit('error', err)` to drive outcomes; the
 * kill() recorder lets tests assert cleanup on timeout.
 */
function makeFakeSpawn() {
  const calls = [];
  const fakeSpawn = (command, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    let killed = false;
    child.kill = (signal) => {
      killed = true;
      child.lastKillSignal = signal;
    };
    Object.defineProperty(child, 'killed', { get: () => killed });
    calls.push({ command, args, opts, child });
    return child;
  };
  return { fakeSpawn, calls };
}

describe('transportAvailabilityHealthExecutor (regression — 2b stub still works)', () => {
  it('passes when declared transport is registered', async () => {
    const result = await transportAvailabilityHealthExecutor(makeContext());
    assert.equal(result.passed, true);
    assert.equal(result.descriptorHash, 'hash-A');
    assert.equal(result.ttlMs, DEFAULT_HEALTH_TTL_MS);
  });

  it('fails when no healthCheck is declared', async () => {
    const result = await transportAvailabilityHealthExecutor(makeContext({ healthCheck: undefined }));
    assert.equal(result.passed, false);
    assert.equal(result.failureReason, 'no-healthcheck-declared');
  });

  it('fails when the cliProbe-required transport is not registered', async () => {
    const result = await transportAvailabilityHealthExecutor(makeContext({}, REGISTRY_HAS_NOTHING));
    assert.equal(result.passed, false);
    assert.match(result.failureReason, /transport-not-registered:cli-jsonl/);
  });
});

describe('createRealCliProbeHealthExecutor — bounded spawn + exit-code check', () => {
  /**
   * Default test wiring: identity resolver (treats the declared command as
   * the resolved absolute path) so unit tests are deterministic + offline.
   * Production wires the real `resolveCliCommand` via the default factory.
   */
  const makeIdentityResolver = () => {
    const seen = [];
    const resolveFn = (command) => {
      seen.push(command);
      return command;
    };
    return { resolveFn, seen };
  };

  const buildExec = (probeTimeoutMs = 5_000, extra = {}) => {
    const { fakeSpawn, calls } = makeFakeSpawn();
    const { resolveFn, seen } = makeIdentityResolver();
    const exec = createRealCliProbeHealthExecutor({ spawnFn: fakeSpawn, resolveFn, probeTimeoutMs, ...extra });
    return { exec, calls, resolverCalls: seen };
  };

  it('passes when the spawned binary exits 0', async () => {
    const { exec, calls } = buildExec();
    const promise = exec(makeContext());
    setImmediate(() => calls[0].child.emit('exit', 0, null));
    const result = await promise;
    assert.equal(result.passed, true);
    assert.equal(result.descriptorHash, 'hash-A');
    assert.equal(result.ttlMs, DEFAULT_HEALTH_TTL_MS);
    assert.equal(calls[0].command, '/usr/bin/true');
    assert.deepEqual(calls[0].args, ['--version']);
    assert.equal(calls[0].opts.stdio[0], 'ignore', 'cliProbe must not feed stdin');
  });

  it('fails with cli-probe-nonzero-exit when binary exits non-zero', async () => {
    const { exec, calls } = buildExec();
    const promise = exec(makeContext());
    setImmediate(() => calls[0].child.emit('exit', 7, null));
    const result = await promise;
    assert.equal(result.passed, false);
    assert.equal(result.failureReason, 'cli-probe-nonzero-exit:7');
  });

  it('fails with cli-probe-spawn-error when child emits error', async () => {
    const { exec, calls } = buildExec();
    const promise = exec(makeContext());
    setImmediate(() => calls[0].child.emit('error', new Error('ENOENT: not found')));
    const result = await promise;
    assert.equal(result.passed, false);
    assert.match(result.failureReason, /cli-probe-spawn-error:.*ENOENT/);
  });

  it('fails with cli-probe-timeout when probe exceeds bounded duration and kills child', async () => {
    const { exec, calls } = buildExec(50);
    const result = await exec(makeContext());
    assert.equal(result.passed, false);
    assert.equal(result.failureReason, 'cli-probe-timeout:50ms');
    assert.equal(calls[0].child.killed, true, 'lingering probe must be killed on timeout');
    assert.equal(calls[0].child.lastKillSignal, 'SIGTERM');
  });

  it('skips spawn for acpInitialize (falls through to transport-availability)', async () => {
    const { fakeSpawn, calls } = makeFakeSpawn();
    const { resolveFn, seen } = makeIdentityResolver();
    const exec = createRealCliProbeHealthExecutor({ spawnFn: fakeSpawn, resolveFn, probeTimeoutMs: 5_000 });
    // acpInitialize requires ACP transport; use a registry that has it.
    const ctx = makeContext(
      { transport: 'acp', healthCheck: { type: 'acpInitialize' } },
      { has: (id) => id === 'acp' },
    );
    const result = await exec(ctx);
    assert.equal(result.passed, true, 'acpInitialize uses transport-availability semantics for now');
    assert.equal(calls.length, 0, 'no spawn should fire for acpInitialize');
    assert.equal(seen.length, 0, 'no resolve should fire for acpInitialize either');
  });

  it('fails fast (no spawn) when declared transport is not registered', async () => {
    const { fakeSpawn, calls } = makeFakeSpawn();
    const { resolveFn } = makeIdentityResolver();
    const exec = createRealCliProbeHealthExecutor({ spawnFn: fakeSpawn, resolveFn, probeTimeoutMs: 5_000 });
    const result = await exec(makeContext({}, REGISTRY_HAS_NOTHING));
    assert.equal(result.passed, false);
    assert.match(result.failureReason, /transport-not-registered/);
    assert.equal(calls.length, 0, 'no spawn should fire when transport is missing');
  });

  it('fails fast (no spawn) when no healthCheck is declared', async () => {
    const { fakeSpawn, calls } = makeFakeSpawn();
    const { resolveFn } = makeIdentityResolver();
    const exec = createRealCliProbeHealthExecutor({ spawnFn: fakeSpawn, resolveFn, probeTimeoutMs: 5_000 });
    const result = await exec(makeContext({ healthCheck: undefined }));
    assert.equal(result.passed, false);
    assert.equal(result.failureReason, 'no-healthcheck-declared');
    assert.equal(calls.length, 0);
  });

  it('only fires once — extra exit events after timeout do not double-resolve', async () => {
    const { exec, calls } = buildExec(30);
    const result = await exec(makeContext());
    // Now simulate the dead-but-not-yet-reaped child eventually emitting exit.
    // The executor must already have settled; this should be a no-op.
    calls[0].child.emit('exit', 0, null);
    assert.equal(result.failureReason, 'cli-probe-timeout:30ms');
  });

  /**
   * P2 review @codex on PR #38: probe MUST resolve the command with the same
   * resolver the real cli-jsonl invocation uses, or approve / invoke split-brain
   * when the binary lives outside $PATH (~/.local/bin, nvm version dirs, etc.).
   * These two tests lock in the new contract.
   */
  it('uses resolveFn to map the manifest command to an absolute path before spawning', async () => {
    const { fakeSpawn, calls } = makeFakeSpawn();
    const resolveFn = (command) => {
      assert.equal(command, 'clowder-code', 'resolver must see the raw manifest command');
      return '/home/user/.local/bin/clowder-code';
    };
    const exec = createRealCliProbeHealthExecutor({ spawnFn: fakeSpawn, resolveFn, probeTimeoutMs: 5_000 });
    const promise = exec(makeContext({ command: 'clowder-code' }));
    setImmediate(() => calls[0].child.emit('exit', 0, null));
    const result = await promise;
    assert.equal(result.passed, true);
    assert.equal(calls[0].command, '/home/user/.local/bin/clowder-code', 'spawn must use the resolved path');
  });

  it('fails with cli-probe-cli-not-found (no spawn) when resolver returns null', async () => {
    const { fakeSpawn, calls } = makeFakeSpawn();
    const exec = createRealCliProbeHealthExecutor({
      spawnFn: fakeSpawn,
      resolveFn: () => null,
      probeTimeoutMs: 5_000,
    });
    const result = await exec(makeContext({ command: 'never-installed-cli' }));
    assert.equal(result.passed, false);
    assert.equal(result.failureReason, 'cli-probe-cli-not-found:never-installed-cli');
    assert.equal(calls.length, 0, 'no spawn should fire when the binary cannot be resolved');
  });
});
