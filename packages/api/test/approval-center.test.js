/**
 * Approval Center Tests
 * 审批中心 — ToolPolicyEngine + ApprovalStore + SuspendedSessionStore + ApprovalManager
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { ToolPolicyEngine } = await import('../dist/domains/cats/services/approval/ToolPolicyEngine.js');
const { ToolPolicyStore } = await import('../dist/domains/cats/services/stores/ports/ToolPolicyStore.js');
const { ApprovalStore } = await import('../dist/domains/cats/services/stores/ports/ApprovalStore.js');
const { SuspendedSessionStore } = await import(
  '../dist/domains/cats/services/stores/ports/SuspendedSessionStore.js'
);
const { ApprovalManager } = await import('../dist/domains/cats/services/approval/ApprovalManager.js');

// ── Shared helpers ──
const CTX = { catId: 'codex', threadId: 't1' };

function addPolicy(store, overrides = {}) {
  return store.add({
    toolPattern: 'git_commit', riskLevel: 'elevated', requiresApproval: true,
    scope: 'global', priority: 10, enabled: true, createdBy: 'admin', ...overrides,
  });
}

const baseApprovalInput = {
  invocationId: 'inv-1', catId: 'codex', threadId: 'thread-1', userId: 'user-1',
  toolName: 'git_commit', toolArgs: { message: 'fix bug' }, policyId: 'pol-1',
  riskLevel: 'elevated', reason: 'committing code',
  currentApproverSpec: { minApprovals: 1 }, expiresAt: Date.now() + 86_400_000,
};

const mkDecision = (by, d = 'approve', scope = 'once') => ({
  decidedBy: by, decidedByType: 'human', decision: d, scope, decidedAt: Date.now(),
});

// ---- ToolPolicyEngine ----
describe('ToolPolicyEngine', () => {
  test('matchPolicy returns null when no policies exist', async () => {
    const engine = new ToolPolicyEngine(new ToolPolicyStore());
    assert.equal(await engine.matchPolicy('git_commit', {}, CTX), null);
  });

  test('matchPolicy matches exact tool name', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store);
    const result = await new ToolPolicyEngine(store).matchPolicy('git_commit', {}, CTX);
    assert.ok(result);
    assert.equal(result.toolPattern, 'git_commit');
  });

  test('matchPolicy matches glob pattern (git_* matches git_commit)', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, { toolPattern: 'git_*' });
    const engine = new ToolPolicyEngine(store);
    assert.ok(await engine.matchPolicy('git_commit', {}, CTX));
    assert.equal(await engine.matchPolicy('file_delete', {}, CTX), null);
  });

  test('matchPolicy returns highest priority policy', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, { toolPattern: 'git_*', priority: 5, riskLevel: 'safe' });
    addPolicy(store, { toolPattern: 'git_*', priority: 20, riskLevel: 'critical' });
    addPolicy(store, { toolPattern: 'git_*', priority: 10, riskLevel: 'elevated' });
    const result = await new ToolPolicyEngine(store).matchPolicy('git_commit', {}, CTX);
    assert.equal(result.priority, 20);
    assert.equal(result.riskLevel, 'critical');
  });

  test('matchPolicy with global scope matches any context', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, { scope: 'global' });
    const engine = new ToolPolicyEngine(store);
    assert.ok(await engine.matchPolicy('git_commit', {}, { catId: 'codex', threadId: 't1' }));
    assert.ok(await engine.matchPolicy('git_commit', {}, { catId: 'opus', threadId: 't2' }));
  });

  test('matchPolicy with thread scope only matches matching threadId', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, { scope: 'thread', scopeId: 'thread-special' });
    const engine = new ToolPolicyEngine(store);
    assert.ok(await engine.matchPolicy('git_commit', {}, { catId: 'codex', threadId: 'thread-special' }));
    assert.equal(await engine.matchPolicy('git_commit', {}, { catId: 'codex', threadId: 'other' }), null);
  });

  test('evaluateCondition with gt/lt/eq operators', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, {
      toolPattern: 'transfer',
      condition: { field: 'amount', operator: 'gt', value: 100, effect: 'require' },
    });
    const engine = new ToolPolicyEngine(store);
    assert.ok(await engine.matchPolicy('transfer', { amount: 200 }, CTX));
    assert.equal(await engine.matchPolicy('transfer', { amount: 50 }, CTX), null);
  });

  test('evaluateCondition with contains/matches operators', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, {
      toolPattern: 'shell_exec',
      condition: { field: 'command', operator: 'contains', value: 'rm -rf', effect: 'require' },
    });
    const engine = new ToolPolicyEngine(store);
    assert.ok(await engine.matchPolicy('shell_exec', { command: 'rm -rf /' }, CTX));
    assert.equal(await engine.matchPolicy('shell_exec', { command: 'ls -la' }, CTX), null);
  });

  test('evaluateCondition effect: require vs exempt', async () => {
    const store = new ToolPolicyStore();
    addPolicy(store, {
      toolPattern: 'file_write',
      condition: { field: 'path', operator: 'contains', value: '/tmp/', effect: 'exempt' },
    });
    const engine = new ToolPolicyEngine(store);
    // /tmp/ path is exempt -> no policy match
    assert.equal(await engine.matchPolicy('file_write', { path: '/tmp/foo.txt' }, CTX), null);
    // non-tmp path is NOT exempt -> policy matches
    assert.ok(await engine.matchPolicy('file_write', { path: '/etc/passwd' }, CTX));
  });
});

// ---- ApprovalStore (in-memory) ----
describe('ApprovalStore (in-memory)', () => {
  test('create returns record with generated id and pending status', () => {
    const rec = new ApprovalStore().create(baseApprovalInput);
    assert.ok(rec.id);
    assert.equal(rec.status, 'pending');
    assert.equal(rec.catId, 'codex');
    assert.equal(rec.toolName, 'git_commit');
    assert.equal(rec.escalationTier, 0);
    assert.deepEqual(rec.decisions, []);
  });

  test('get retrieves by id', () => {
    const store = new ApprovalStore();
    const rec = store.create(baseApprovalInput);
    assert.deepEqual(store.get(rec.id), rec);
    assert.equal(store.get('nonexistent'), null);
  });

  test('update changes status', () => {
    const store = new ApprovalStore();
    const rec = store.create(baseApprovalInput);
    const updated = store.update(rec.id, { status: 'approved' });
    assert.equal(updated.status, 'approved');
    assert.equal(store.get(rec.id).status, 'approved');
  });

  test('addDecision appends to decisions array', () => {
    const store = new ApprovalStore();
    const rec = store.create(baseApprovalInput);
    const u1 = store.addDecision(rec.id, mkDecision('user-1'));
    assert.equal(u1.decisions.length, 1);
    assert.equal(u1.decisions[0].decidedBy, 'user-1');
    const u2 = store.addDecision(rec.id, mkDecision('user-2'));
    assert.equal(u2.decisions.length, 2);
  });

  test('listPending returns only pending/escalated requests', () => {
    const store = new ApprovalStore();
    store.create(baseApprovalInput);
    const r2 = store.create({ ...baseApprovalInput, invocationId: 'inv-2' });
    store.update(r2.id, { status: 'approved' });
    const r3 = store.create({ ...baseApprovalInput, invocationId: 'inv-3' });
    store.update(r3.id, { status: 'escalated' });
    assert.equal(store.listPending().length, 2); // pending + escalated
  });

  test('listPending filters by threadId', () => {
    const store = new ApprovalStore();
    store.create({ ...baseApprovalInput, threadId: 't1' });
    store.create({ ...baseApprovalInput, threadId: 't2', invocationId: 'inv-2' });
    store.create({ ...baseApprovalInput, threadId: 't1', invocationId: 'inv-3' });
    assert.equal(store.listPending('t1').length, 2);
    assert.equal(store.listPending('t2').length, 1);
    assert.equal(store.listPending('t3').length, 0);
  });
});

// ---- SuspendedSessionStore (in-memory) ----
describe('SuspendedSessionStore (in-memory)', () => {
  const mkSession = (id = 'req-1') => ({
    approvalRequestId: id, catId: 'codex', threadId: 'thread-1', userId: 'user-1',
    cliSessionId: 'cli-1', sessionRecordId: 'sess-1',
    pendingToolCall: { toolName: 'git_commit', toolArgs: { message: 'fix' } },
    invocationSnapshot: { invocationId: 'inv-1', callbackToken: '' },
    suspendedAt: Date.now(), expiresAt: Date.now() + 86_400_000,
  });

  test('save and get roundtrip', () => {
    const store = new SuspendedSessionStore();
    store.save(mkSession('req-1'));
    const f = store.get('req-1');
    assert.ok(f);
    assert.equal(f.approvalRequestId, 'req-1');
    assert.equal(f.catId, 'codex');
  });

  test('remove deletes record', () => {
    const store = new SuspendedSessionStore();
    store.save(mkSession('req-1'));
    assert.equal(store.remove('req-1'), true);
    assert.equal(store.get('req-1'), null);
    assert.equal(store.remove('req-1'), false);
  });

  test('listAll returns all', () => {
    const store = new SuspendedSessionStore();
    store.save(mkSession('req-1'));
    store.save(mkSession('req-2'));
    store.save(mkSession('req-3'));
    assert.equal(store.listAll().length, 3);
  });
});

// ---- AuthorizationManager.addRule ----
const { AuthorizationManager } = await import('../dist/domains/cats/services/auth/AuthorizationManager.js');
const { AuthorizationRuleStore } = await import('../dist/domains/cats/services/stores/ports/AuthorizationRuleStore.js');

describe('AuthorizationManager.addRule', () => {
  function createAuthManager() {
    const ruleStore = new AuthorizationRuleStore();
    const pendingStore = { create: async () => ({}), respond: async () => null, get: async () => null, listWaiting: async () => [] };
    const auditStore = { append: async () => {} };
    const mgr = new AuthorizationManager({ ruleStore, pendingStore, auditStore });
    return { mgr, ruleStore };
  }

  test('addRule creates a rule findable by checkRule', async () => {
    const { mgr } = createAuthManager();
    await mgr.addRule({ catId: 'assistant', action: 'run_command', scope: 'thread', decision: 'allow', threadId: 't1', createdBy: 'user-1' });
    assert.equal(await mgr.checkRule('assistant', 'run_command', 't1'), 'allow');
    // Different thread should not match
    assert.equal(await mgr.checkRule('assistant', 'run_command', 't2'), null);
  });

  test('addRule with global scope matches any thread', async () => {
    const { mgr } = createAuthManager();
    await mgr.addRule({ catId: 'codex', action: 'git_push', scope: 'global', decision: 'deny', createdBy: 'admin' });
    assert.equal(await mgr.checkRule('codex', 'git_push', 'any-thread'), 'deny');
  });

  test('addRule with ttlSeconds auto-removes rule after timeout', async () => {
    const { mgr } = createAuthManager();
    await mgr.addRule({ catId: 'assistant', action: 'mcp_exec', scope: 'thread', decision: 'allow', threadId: 't1', createdBy: 'user-1', ttlSeconds: 1 });
    // Rule exists immediately
    assert.equal(await mgr.checkRule('assistant', 'mcp_exec', 't1'), 'allow');
    // After 1.2s it should be gone
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await mgr.checkRule('assistant', 'mcp_exec', 't1'), null);
  });
});

// ---- ApprovalManager ----
describe('ApprovalManager', () => {
  const mockPolicy = (overrides = {}) => ({
    id: 'pol-1', toolPattern: 'git_commit', riskLevel: 'elevated',
    requiresApproval: true, scope: 'global', priority: 10, enabled: true,
    approverSpec: { minApprovals: 1 }, ...overrides,
  });

  function createManager(opts = {}) {
    const ruleStore = new AuthorizationRuleStore();
    const authManager = {
      checkRule: async () => opts.ruleResult ?? null,
      respond: async () => null,
      addRule: async (input) => {
        const rule = ruleStore.add(input);
        return rule;
      },
      _ruleStore: ruleStore,
    };
    const policyEngine = { matchPolicy: async () => opts.policyResult ?? null };
    const approvalStore = new ApprovalStore();
    const suspendedSessionStore = new SuspendedSessionStore();
    const manager = new ApprovalManager({
      authManager, policyEngine, approvalStore, suspendedSessionStore,
    });
    return { manager, approvalStore, suspendedSessionStore, ruleStore };
  }

  const req = {
    invocationId: 'inv-1', catId: 'codex', threadId: 'thread-1',
    userId: 'user-1', toolName: 'git_commit',
    toolArgs: { message: 'fix bug' }, reason: 'committing code',
  };

  test('requestApproval returns granted when no policy matches', async () => {
    assert.equal((await createManager().manager.requestApproval(req)).status, 'granted');
  });

  test('requestApproval returns granted when auth rule allows', async () => {
    const { manager } = createManager({ ruleResult: 'allow' });
    assert.equal((await manager.requestApproval(req)).status, 'granted');
  });

  test('requestApproval returns denied when auth rule denies', async () => {
    const { manager } = createManager({ ruleResult: 'deny' });
    assert.equal((await manager.requestApproval(req)).status, 'denied');
  });

  test('requestApproval returns suspended when policy requires approval', async () => {
    const { manager } = createManager({ policyResult: mockPolicy() });
    const res = await manager.requestApproval(req);
    assert.equal(res.status, 'suspended');
    assert.ok(res.approvalRequestId);
    assert.equal(res.riskLevel, 'elevated');
  });

  test('respondToApproval with approve updates status to approved', async () => {
    const { manager, approvalStore } = createManager({ policyResult: mockPolicy() });
    const res = await manager.requestApproval(req);
    await manager.respondToApproval(res.approvalRequestId, mkDecision('user-1', 'approve'));
    assert.equal(approvalStore.get(res.approvalRequestId).status, 'approved');
  });

  test('respondToApproval with deny updates status to denied', async () => {
    const { manager, approvalStore } = createManager({ policyResult: mockPolicy() });
    const res = await manager.requestApproval(req);
    await manager.respondToApproval(res.approvalRequestId, mkDecision('user-1', 'deny'));
    assert.equal(approvalStore.get(res.approvalRequestId).status, 'denied');
  });

  test('respondToApproval with quorum (minApprovals > 1) waits for more', async () => {
    const { manager, approvalStore } = createManager({
      policyResult: mockPolicy({ approverSpec: { minApprovals: 2 }, riskLevel: 'critical' }),
    });
    const res = await manager.requestApproval(req);
    const id = res.approvalRequestId;
    // First approval - not enough
    await manager.respondToApproval(id, mkDecision('user-1'));
    assert.equal(approvalStore.get(id).status, 'pending');
    // Second approval - quorum reached
    await manager.respondToApproval(id, mkDecision('user-2'));
    assert.equal(approvalStore.get(id).status, 'approved');
  });

  test('respondToApproval creates auth rule via addRule (not respond)', async () => {
    const { manager, ruleStore } = createManager({ policyResult: mockPolicy() });
    const res = await manager.requestApproval(req);
    await manager.respondToApproval(res.approvalRequestId, mkDecision('user-1', 'approve', 'thread'));
    // Rule should exist for catId + toolName + threadId
    const rule = ruleStore.match('codex', 'git_commit', 'thread-1');
    assert.ok(rule, 'rule should be created in ruleStore');
    assert.equal(rule.decision, 'allow');
    assert.equal(rule.scope, 'thread');
    assert.equal(rule.threadId, 'thread-1');
  });

  test('respondToApproval with scope=once creates ephemeral thread rule', async () => {
    const { manager, ruleStore } = createManager({ policyResult: mockPolicy() });
    const res = await manager.requestApproval(req);
    await manager.respondToApproval(res.approvalRequestId, mkDecision('user-1', 'approve', 'once'));
    // once -> mapped to thread scope
    const rule = ruleStore.match('codex', 'git_commit', 'thread-1');
    assert.ok(rule, 'once should create a thread-scoped rule');
    assert.equal(rule.scope, 'thread');
  });

  test('respondToApproval with scope=global creates global rule', async () => {
    const { manager, ruleStore } = createManager({ policyResult: mockPolicy() });
    const res = await manager.requestApproval(req);
    await manager.respondToApproval(res.approvalRequestId, mkDecision('user-1', 'approve', 'global'));
    const rule = ruleStore.match('codex', 'git_commit', 'any-thread');
    assert.ok(rule, 'global rule should match any thread');
    assert.equal(rule.scope, 'global');
  });
});
