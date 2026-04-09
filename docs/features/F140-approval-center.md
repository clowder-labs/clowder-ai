---
feature: F140 — Approval Center (审查中心)
status: design
author: Ragdoll (Claude)
created: 2026-04-08
---

# F140: Approval Center (审查中心) — Architecture Design

## Context

OfficeClaw lacks an enterprise-grade tool approval workflow. The existing `AuthorizationManager` provides basic permission request/response (120s sync wait), but doesn't support tool risk policies, agent-side interception, session suspension/resumption, or enterprise OA integration. This design extends the system at **all three layers**: Agent-side (where tools actually execute), Gateway-side (central orchestration), and Channel-side (external OA delivery).

---

## Full-Stack Architecture

The approval system operates across **four layers**, each with distinct interception points:

```
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 1: AGENT RUNTIME (工具实际执行的地方)                            │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐              │
│  │  Jiuwenclaw   │  │  Dare Agent  │  │  Claude/ACP   │              │
│  │  (ReAct)      │  │  (Hook-based)│  │  (MCP-native) │              │
│  │               │  │              │  │               │              │
│  │ PermissionEng │  │ BEFORE_TOOL  │  │ MCP tools/call│              │
│  │ → check_tool_ │  │ Hook         │  │ → registerTool│              │
│  │   permissions │  │ → Governed   │  │   wrapper     │              │
│  │ → _request_   │  │   ToolGateway│  │               │              │
│  │   permission_ │  │ → Approval   │  │               │              │
│  │   approval()  │  │   Manager    │  │               │              │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘              │
│         │                  │                   │                      │
│         └──────────┬───────┴───────────────────┘                     │
│                    │ HTTP Callback / RPC                              │
│                    ▼                                                  │
├──────────────────────────────────────────────────────────────────────┤
│ LAYER 2: GATEWAY (审批中心核心)                                       │
│                                                                      │
│  ┌──────────────────────────────────────────┐                        │
│  │         ApprovalManager                  │                        │
│  │  ┌──────────────┐  ┌─────────────────┐   │                        │
│  │  │ ToolPolicy   │  │ SuspendedSession│   │                        │
│  │  │ Engine       │  │ Store           │   │                        │
│  │  └──────────────┘  └─────────────────┘   │                        │
│  │  ┌──────────────┐  ┌─────────────────┐   │                        │
│  │  │ ApprovalStore│  │ AuthorizationMgr│   │                        │
│  │  │ (Redis)      │  │ (existing, wrap)│   │                        │
│  │  └──────────────┘  └─────────────────┘   │                        │
│  └────────────────────┬─────────────────────┘                        │
│                       │                                              │
├───────────────────────┼──────────────────────────────────────────────┤
│ LAYER 3: CHANNEL GATEWAY (审批通知与回调)                              │
│                       │                                              │
│  ┌────────────────────▼─────────────────────┐                        │
│  │       ApprovalChannelGateway             │                        │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────────┐│                        │
│  │  │WebSocket│ │ Feishu  │ │  DingTalk   ││                        │
│  │  │Channel  │ │ Channel │ │  Channel    ││                        │
│  │  └─────────┘ └─────────┘ └─────────────┘│                        │
│  │  ┌─────────┐ ┌─────────┐                │                        │
│  │  │ Webhook │ │ Custom  │                │                        │
│  │  │ Channel │ │ Plugin  │                │                        │
│  │  └─────────┘ └─────────┘                │                        │
│  └──────────────────────────────────────────┘                        │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ LAYER 4: FRONTEND (审批 UI)                                          │
│  ApprovalCenterPage / ApprovalRequestCard / useApprovalCenter        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. Agent-Side Interception (Layer 1) — 三种 Agent 框架的联动

This is the critical layer that addresses *how agents actually integrate with the approval system*. Each agent framework has its own tool execution pipeline, and each needs a different integration strategy.

### 1.1 Jiuwenclaw (ReAct Agent) Integration

**Existing pipeline** (`vendor/jiuwenclaw/jiuwenclaw/agentserver/react_agent.py`):
```
LLM call → tool_calls → check_tool_permissions() → [ALLOW|ASK|DENY]
                              ↓ (if ASK)
                    _request_permission_approval()
                    → assess risk (LLM/static)
                    → emit chat.ask_user_question popup
                    → wait 300s for user response
                    → return "allow_once" | "allow_always" | "deny"
```

**Key interception points:**
- `check_tool_permissions()` at `permissions/checker.py:43` — evaluates each tool call
- `_request_permission_approval()` at `react_agent.py:681` — the approval callback
- `_pause_event` at `react_agent.py:127` — session-level pause/resume

**Integration strategy: Extend `_request_permission_approval()` to delegate to central ApprovalManager**

The current implementation sends a `chat.ask_user_question` popup and waits locally. We extend this to **call the central API first**:

```python
# vendor/jiuwenclaw/jiuwenclaw/agentserver/react_agent.py
# Modified _request_permission_approval()

async def _request_permission_approval(self, session, tool_call, result):
    tool_name = getattr(tool_call, "name", "")
    tool_args = getattr(tool_call, "arguments", {})
    
    # ── Step 1: Check central ToolPolicyEngine via callback API ──
    callback_config = get_callback_config()  # CAT_CAFE_API_URL + tokens
    if callback_config:
        resp = await http_post(f"{callback_config.api_url}/api/callbacks/request-tool-execution", {
            "invocationId": callback_config.invocation_id,
            "callbackToken": callback_config.callback_token,
            "toolName": tool_name,
            "toolArgs": tool_args,
            "reason": result.reason or f"Agent wants to execute {tool_name}",
            "riskAssessment": await assess_risk(tool_name, tool_args),
        })
        
        if resp["status"] == "granted":
            return "allow_once"
        elif resp["status"] == "denied":
            return "deny"
        elif resp["status"] == "suspended":
            # ── Central approval required → suspend agent ──
            approval_request_id = resp["approvalRequestId"]
            
            # Option A: Wait with polling (short approval flows)
            if resp.get("expectedWaitMs", 0) < 300_000:  # < 5 min
                return await self._poll_approval_status(
                    callback_config, approval_request_id, timeout=300
                )
            
            # Option B: Suspend session (long OA flows)
            # Emit suspension message to user, then return deny
            # The session will be resumed externally via InvocationQueue
            await self._emit_suspension_notice(session, tool_name, approval_request_id)
            return "deny"  # ends current ReAct iteration gracefully
    
    # ── Fallback: local approval popup (no central server) ──
    return await self._local_approval_popup(session, tool_call, result)
```

**Policy sync**: The jiuwenclaw `PermissionEngine` config (`permissions/core.py`) can be **bootstrapped from central ToolPolicyEngine** at agent startup:

```python
# At agent initialization (interface.py:413)
async def _sync_tool_policies(self, callback_config):
    """Fetch central tool policies and merge into local PermissionEngine config."""
    resp = await http_get(f"{callback_config.api_url}/api/approval/policies")
    for policy in resp["policies"]:
        # Convert central ToolPolicy → jiuwenclaw permission config format
        self._permission_engine.merge_remote_policy(policy)
```

**Session suspension via `_pause_event`**: When a long OA approval is needed, the agent can use the existing `pause()`/`resume()` mechanism:

```python
# Suspend: clear pause event → agent blocks at next checkpoint
self._pause_events[task_key].clear()

# Resume (called when approval comes back via InvocationQueue):
self._pause_events[task_key].set()
```

### 1.2 Dare Agent Integration

**Existing pipeline** (`vendor/dare-cli/dare_framework/agent/_internal/tool_executor.py`):
```
run_tool_loop()
  → emit BEFORE_TOOL hook       ← Interception #1 (HookDecision: ALLOW|BLOCK|ASK)
  → _evaluate_tool_security()   ← Interception #2 (PolicyDecision: ALLOW|APPROVE_REQUIRED|DENY)
  → GovernedToolGateway.invoke()
    → _resolve_approval()       ← Interception #3 (approval flow)
    → delegate.invoke()         (actual tool execution)
  → emit AFTER_TOOL hook        ← Post-execution audit
```

**Key interception points:**
- `HookPhase.BEFORE_TOOL` hook at `tool_executor.py:107` — extensible
- `GovernedToolGateway._resolve_approval()` at `governed_tool_gateway.py:155` — approval pipeline
- `ToolApprovalManager.evaluate()` at `control/approval_manager.py` — rule matching

**Integration strategy: Add a `CatCafeApprovalHook` that bridges to central ApprovalManager**

Dare's hook system is designed for exactly this. We add a hook that intercepts BEFORE_TOOL and delegates to the central system:

```python
# vendor/dare-cli/dare_framework/hook/cat_cafe_approval_hook.py

class CatCafeApprovalHook:
    """Dare hook that bridges tool approval to Cat-Cafe central ApprovalManager."""
    
    phase = HookPhase.BEFORE_TOOL
    
    async def __call__(self, context: HookContext) -> HookDispatch:
        tool_name = context.payload["tool_name"]
        tool_args = context.payload.get("arguments", {})
        
        callback_config = get_callback_config()
        if not callback_config:
            return HookDispatch(decision=HookDecision.ALLOW)
        
        resp = await http_post(
            f"{callback_config.api_url}/api/callbacks/request-tool-execution",
            {
                "invocationId": callback_config.invocation_id,
                "callbackToken": callback_config.callback_token,
                "toolName": tool_name,
                "toolArgs": tool_args,
                "reason": context.payload.get("reason", ""),
            }
        )
        
        if resp["status"] == "granted":
            return HookDispatch(decision=HookDecision.ALLOW)
        elif resp["status"] == "denied":
            return HookDispatch(decision=HookDecision.BLOCK, reason=resp.get("reason"))
        elif resp["status"] == "suspended":
            # Delegate to GovernedToolGateway approval resolution
            context.payload["requires_approval"] = True
            context.payload["approval_request_id"] = resp["approvalRequestId"]
            return HookDispatch(decision=HookDecision.ASK)
        
        return HookDispatch(decision=HookDecision.ALLOW)
```

**Alternatively**, extend `GovernedToolGateway._resolve_approval()` to check central API as one of its approval providers:

```python
# governed_tool_gateway.py - extend _resolve_approval()
async def _resolve_approval(self, capability_id, params, session_id, transport, ...):
    # 1. Check local rules first (fast path)
    local_eval = await self._approval_manager.evaluate(capability_id, params)
    if local_eval.status == ApprovalStatus.ALLOW:
        return ApprovalResolution(verdict="allow")
    
    # 2. Check central Cat-Cafe ApprovalManager (remote)
    if self._cat_cafe_config:
        central_eval = await self._check_central_approval(capability_id, params)
        if central_eval:
            return central_eval
    
    # 3. Fallback to local transport-based approval
    return await self._local_approval(transport, capability_id, params)
```

### 1.3 Claude/ACP/MCP-Native Agent Integration

**Existing pipeline**: These agents use MCP tools served by `packages/mcp-server/`. Tool calls go:
```
Agent LLM → MCP tools/call → server-toolsets.ts registerTools() → tool.handler() → HTTP callback
```

**Key interception point**: `server-toolsets.ts:39-48` — the `registerTools()` function wraps ALL tool handlers.

**Integration strategy: Add middleware wrapper in `registerTools()`**

```typescript
// packages/mcp-server/src/server-toolsets.ts

/** Tool execution gate — checks central policy before handler runs */
async function gateToolExecution(
  toolName: string,
  args: unknown,
  handler: (args: never) => Promise<unknown>,
): Promise<unknown> {
  const config = getCallbackConfig(); // from env: CAT_CAFE_API_URL, etc.
  if (!config) return handler(args as never); // no gateway → pass-through

  // Check central policy
  const resp = await fetch(`${config.apiUrl}/api/callbacks/check-tool-policy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invocationId: config.invocationId,
      callbackToken: config.callbackToken,
      toolName,
      toolArgs: args,
    }),
  });

  const policy = await resp.json();
  
  if (!policy.requiresApproval) {
    return handler(args as never); // safe tool → execute immediately
  }

  // Tool requires approval → return suspension signal to agent
  // The agent LLM sees this as tool result and should pause
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'approval_required',
        approvalRequestId: policy.approvalRequestId,
        message: `Tool "${toolName}" requires approval before execution. ` +
          `Approval request ${policy.approvalRequestId} has been created. ` +
          `Your session will be resumed after approval. Please end your current turn.`,
        toolName,
        riskLevel: policy.riskLevel,
      }),
    }],
    isError: false,
  };
}

function registerTools(server: McpServer, tools: readonly ToolDef[]): void {
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      const result = await gateToolExecution(tool.name, args, tool.handler);
      return {
        ...(result as Record<string, unknown>),
      } as { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
    });
  }
}
```

### 1.4 ACP Agent (relay-teams) Integration

**Existing pipeline**: ACP agents emit `session/request_permission` RPC for permission requests.

**Key interception point**: `ACPAgentService.ts` `handleACPControlMessage()` — already handles permission RPC.

**Integration strategy: Extend `handleACPControlMessage()` to delegate to central ApprovalManager**

```typescript
// packages/api/src/domains/cats/services/agents/providers/ACPAgentService.ts
// Extend handleACPControlMessage()

if (incoming.method === 'session/request_permission') {
  // Check central ApprovalManager first
  const approvalResult = await approvalManager.requestApproval({
    catId, threadId, toolName: permissionAction,
    toolArgs: incoming.params?.context ?? {},
    reason: incoming.params?.reason ?? '',
  });
  
  if (approvalResult.status === 'suspended') {
    // Long approval → pause ACP session
    await client.call('session/cancel', { sessionId });
    // Session will be resumed via InvocationQueue after approval
    return true;
  }
  
  // Short approval or rule match → respond immediately
  const optionId = approvalResult.status === 'granted' ? 'allow_once' : 'reject';
  await client.call('session/request_permission', { sessionId, optionId });
  return true;
}
```

### 1.5 Agent-Side Integration Summary

| Agent Framework | Interception Point | File | Integration Method |
|---|---|---|---|
| **Jiuwenclaw** | `_request_permission_approval()` | `react_agent.py:681` | Extend callback to call central API; use `_pause_event` for suspension |
| **Jiuwenclaw** | `check_tool_permissions()` | `permissions/checker.py:43` | Sync central policies to local PermissionEngine at startup |
| **Dare** | `BEFORE_TOOL` hook | `tool_executor.py:107` | Add `CatCafeApprovalHook` that calls central API |
| **Dare** | `GovernedToolGateway._resolve_approval()` | `governed_tool_gateway.py:155` | Extend to check central ApprovalManager as provider |
| **MCP-native** (Claude/Codex) | `registerTools()` wrapper | `server-toolsets.ts:39` | Add `gateToolExecution()` middleware before handler |
| **ACP** (relay-teams) | `handleACPControlMessage()` | `ACPAgentService.ts` | Extend `session/request_permission` handler |

---

## 2. Gateway Core (Layer 2) — Central ApprovalManager

### 2.1 Data Models

```typescript
// packages/shared/src/types/approval.ts

type ToolRiskLevel = 'safe' | 'elevated' | 'dangerous' | 'critical';

interface ToolPolicy {
  id: string;
  toolPattern: string;        // glob: 'git_*', 'file_delete', 'mcp_exec_command'
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  condition?: ToolPolicyCondition;
  approverSpec?: ApproverSpec;
  timeoutMs?: number;         // override default (e.g. 24h for OA)
  escalationChain?: EscalationTarget[];
  scope: 'global' | 'project' | 'thread';
  scopeId?: string;
  priority: number;
  enabled: boolean;
  createdAt: number;
  createdBy: string;
}

interface ToolPolicyCondition {
  field: string;              // JSONPath into tool args
  operator: 'gt' | 'lt' | 'eq' | 'neq' | 'contains' | 'matches';
  value: string | number;
  effect: 'require' | 'exempt';
}

interface ApproverSpec {
  userIds?: string[];
  roles?: string[];
  agentIds?: string[];        // CatIds that can approve (agent-as-approver)
  minApprovals?: number;      // quorum (default 1)
}

interface EscalationTarget {
  delayMs: number;
  approverSpec: ApproverSpec;
  channelIds?: string[];
}

type ApprovalStatus =
  | 'pending' | 'escalated' | 'approved' | 'denied'
  | 'expired' | 'canceled' | 'executing' | 'executed' | 'exec_failed';

interface ApprovalRequest {
  id: string;
  invocationId: string;
  catId: CatId;
  threadId: string;
  userId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;  // "prepared systemRunPlan"
  policyId: string;
  riskLevel: ToolRiskLevel;
  reason: string;
  context?: string;
  status: ApprovalStatus;
  escalationTier: number;
  currentApproverSpec: ApproverSpec;
  decisions: ApprovalDecision[];
  suspendedSessionId?: string;
  suspendedCliSessionId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  notifiedChannels: string[];
}

interface ApprovalDecision {
  decidedBy: string;
  decidedByType: 'human' | 'agent';
  decision: 'approve' | 'deny';
  reason?: string;
  scope: RespondScope;
  decidedAt: number;
}

interface SuspendedSessionState {
  approvalRequestId: string;
  catId: CatId;
  threadId: string;
  userId: string;
  cliSessionId: string;
  sessionRecordId: string;
  pendingToolCall: {
    toolName: string;
    toolArgs: Record<string, unknown>;
    callId?: string;
  };
  invocationSnapshot: {
    invocationId: string;
    callbackToken: string;
  };
  suspendedAt: number;
  expiresAt: number;
}
```

### 2.2 ToolPolicyEngine

```typescript
// packages/api/src/domains/cats/services/approval/ToolPolicyEngine.ts

class ToolPolicyEngine {
  constructor(private policyStore: IToolPolicyStore) {}

  /** Match tool call against policies. Returns highest-priority match. */
  async matchPolicy(
    toolName: string,
    toolArgs: Record<string, unknown>,
    context: { catId: CatId; threadId: string },
  ): Promise<ToolPolicy | null> {
    const policies = await this.policyStore.listEnabled();
    let bestMatch: ToolPolicy | null = null;

    for (const policy of policies) {
      if (!matchGlob(policy.toolPattern, toolName)) continue;
      if (!this.evaluateScope(policy, context)) continue;
      if (policy.condition && !this.evaluateCondition(policy.condition, toolArgs)) continue;
      if (!bestMatch || policy.priority > bestMatch.priority) bestMatch = policy;
    }
    return bestMatch;
  }

  private evaluateCondition(cond: ToolPolicyCondition, args: Record<string, unknown>): boolean {
    const value = getByPath(args, cond.field);
    // evaluate operator...
    const matched = /* operator logic */;
    return cond.effect === 'require' ? matched : !matched;
  }
}
```

### 2.3 ApprovalManager

```typescript
// packages/api/src/domains/cats/services/approval/ApprovalManager.ts

class ApprovalManager {
  constructor(
    private authManager: AuthorizationManager,  // existing, wrapped
    private policyEngine: ToolPolicyEngine,
    private approvalStore: IApprovalStore,
    private suspendedSessionStore: ISuspendedSessionStore,
    private channelGateway: ApprovalChannelGateway,
    private invocationQueue: InvocationQueue,
    private io?: SocketIOServer,
  ) {}

  /**
   * Central entry point — called by all agent interception layers.
   * Returns: { status: 'granted'|'denied'|'suspended', approvalRequestId?, ... }
   */
  async requestApproval(req: {
    invocationId: string;
    catId: CatId;
    threadId: string;
    userId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    reason: string;
    riskAssessment?: { level: string; explanation: string };
  }): Promise<ApprovalResponse> {
    // 1. Check existing authorization rules (fast path)
    const ruleDecision = await this.authManager.checkRule(req.catId, req.toolName, req.threadId);
    if (ruleDecision === 'allow') return { status: 'granted' };
    if (ruleDecision === 'deny') return { status: 'denied' };

    // 2. Match tool policy
    const policy = await this.policyEngine.matchPolicy(
      req.toolName, req.toolArgs, { catId: req.catId, threadId: req.threadId },
    );
    if (!policy || !policy.requiresApproval) return { status: 'granted' };

    // 3. Create approval request
    const approvalReq = await this.approvalStore.create({
      ...req,
      policyId: policy.id,
      riskLevel: policy.riskLevel,
      currentApproverSpec: policy.approverSpec ?? { minApprovals: 1 },
      expiresAt: Date.now() + (policy.timeoutMs ?? 86_400_000), // default 24h
    });

    // 4. Snapshot session state for later resume
    await this.suspendSession(approvalReq);

    // 5. Notify approvers via all channels
    const notified = await this.channelGateway.notifyApprovers(approvalReq);
    await this.approvalStore.update(approvalReq.id, { notifiedChannels: notified });

    // 6. Audit log
    await this.auditStore.append({ ... });

    return {
      status: 'suspended',
      approvalRequestId: approvalReq.id,
      riskLevel: policy.riskLevel,
      expectedWaitMs: policy.timeoutMs,
    };
  }

  /**
   * Human/agent approves or denies. Triggers session resumption if approved.
   */
  async respondToApproval(
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ApprovalRequest | null> {
    const req = await this.approvalStore.get(requestId);
    if (!req || req.status !== 'pending' && req.status !== 'escalated') return null;

    // Record decision
    const updated = await this.approvalStore.addDecision(requestId, decision);

    // Check quorum
    const approveCount = updated.decisions.filter(d => d.decision === 'approve').length;
    const needed = updated.currentApproverSpec.minApprovals ?? 1;

    if (decision.decision === 'deny') {
      await this.approvalStore.update(requestId, { status: 'denied' });
      await this.notifyDenial(updated);
      return updated;
    }

    if (approveCount >= needed) {
      await this.approvalStore.update(requestId, { status: 'approved' });
      
      // Create authorization rule if scope != 'once'
      if (decision.scope !== 'once') {
        await this.authManager.respond(/* create persistent rule */);
      }

      // Resume the suspended session
      await this.resumeSession(updated);
      return updated;
    }

    return updated; // still waiting for more approvals
  }

  /** Resume suspended agent session after approval */
  private async resumeSession(req: ApprovalRequest): Promise<void> {
    const suspended = await this.suspendedSessionStore.get(req.id);
    if (!suspended) return;

    // Enqueue resume via InvocationQueue (reuses existing mechanism)
    this.invocationQueue.enqueue({
      threadId: req.threadId,
      userId: req.userId,
      content: `[APPROVAL_GRANTED] Tool "${req.toolName}" has been approved (request ${req.id}). ` +
        `Please execute the previously requested tool with these arguments: ` +
        JSON.stringify(req.toolArgs),
      source: 'agent',
      targetCats: [req.catId],
      intent: 'execute',
      autoExecute: true,
      resumeCatId: req.catId,
    });
  }
}
```

---

## 3. State Machine — Approval Lifecycle

```
[Agent calls tool] ──→ [Agent-side interception]
                              │
                    [HTTP to central API]
                              │
                    [ToolPolicyEngine.matchPolicy()]
                              │
                    ┌─────────┼─────────┐
                    │                   │
               [no policy         [policy matched]
                matched]                │
                    │          [requiresApproval?]
               [status:          /           \
                granted]      [no]          [yes]
                             [granted]   [create ApprovalRequest]
                                          status=PENDING
                                               │
                              ┌────────────────┼────────────────┐
                              │                                 │
                         [human/agent                     [timeout]
                          responds]                            │
                              │                      [escalation chain?]
                    ┌─────────┼─────────┐             /           \
                    │                   │          [yes]          [no]
                [approve]           [deny]          │              │
                    │                   │    ESCALATED          EXPIRED
               [quorum met?]      DENIED             │
                /         \          │         [next tier]
            [yes]        [no]   [notify agent]      │
              │           │                    [repeat]
          APPROVED    [wait more]
              │
         [resumeSession()]
              │
         [InvocationQueue.enqueue()
          with resumeCatId]
              │
         [agent resumes]
              │
          EXECUTING
           /      \
      [success]  [fail]
          │        │
      EXECUTED  EXEC_FAILED
```

---

## 4. Session Suspension & Resumption (Per Agent Framework)

### 4.1 Jiuwenclaw Suspension

```python
# When central API returns "suspended":
# 1. Agent's _request_permission_approval() receives suspension signal
# 2. For short waits: poll check-execution-status endpoint
# 3. For long waits: emit suspension notice + return "deny" to end iteration

# Resumption (triggered by InvocationQueue):
# 1. New invocation starts with resumeCatId = catId
# 2. Message contains [APPROVAL_GRANTED] + tool args
# 3. Agent LLM reads the message and executes the approved tool
# 4. Since jiuwenclaw uses --resume, session context is preserved
```

### 4.2 Dare Suspension

```python
# When CatCafeApprovalHook returns ASK:
# 1. GovernedToolGateway._resolve_approval() enters approval flow
# 2. If central API returns "suspended":
#    - ApprovalInvokeContext carries the approvalRequestId
#    - Transport receives suspension signal
#    - run_tool_loop() returns with approval_pending status
# 3. Dare agent CLI exits gracefully

# Resumption:
# 1. InvocationQueue triggers new invocation with resumeCatId
# 2. Dare CLI spawned with --resume flag
# 3. Agent sees approval context and executes tool
```

### 4.3 MCP-Native (Claude/ACP) Suspension

```
# When gateToolExecution() returns suspension signal:
# 1. MCP tool returns { content: "approval_required", ... } (NOT isError)
# 2. Agent LLM reads this as tool result
# 3. LLM should respond: "I need approval for X. I'll pause until approved."
# 4. Agent turn ends naturally

# Resumption:
# 1. InvocationQueue triggers new invocation with resumeCatId
# 2. Claude CLI uses --resume to continue session
# 3. New message: "[APPROVAL_GRANTED] Execute tool X with args Y"
# 4. Agent executes the tool (now allowed by authorization rule)
```

---

## 5. Approval Channel Gateway (Layer 3)

### 5.1 Channel Interface

```typescript
interface IApprovalChannel {
  id: string;
  type: 'websocket' | 'webhook' | 'dingtalk' | 'feishu' | 'wecom' | 'telegram' | 'custom';
  sendApprovalRequest(request: ApprovalRequest): Promise<{ delivered: boolean; externalId?: string }>;
  sendApprovalResult(request: ApprovalRequest, decision: ApprovalDecision): Promise<void>;
  sendEscalation(request: ApprovalRequest, tier: number): Promise<void>;
  parseInboundResponse?(payload: unknown): ApprovalDecision | null;
}
```

### 5.2 Channel Gateway

```typescript
class ApprovalChannelGateway {
  private channels = new Map<string, IApprovalChannel>();

  async notifyApprovers(request: ApprovalRequest): Promise<string[]> {
    const notified: string[] = [];
    for (const ch of this.sortedChannels()) {
      const result = await ch.sendApprovalRequest(request);
      if (result.delivered) notified.push(ch.id);
    }
    return notified;
  }

  async handleInboundResponse(channelId: string, payload: unknown): Promise<ApprovalDecision | null> {
    return this.channels.get(channelId)?.parseInboundResponse?.(payload) ?? null;
  }
}
```

### 5.3 Built-in Channels

- **WebSocketChannel**: Reuses existing `SocketManager.broadcastToRoom()`. Ships in Phase 1.
- **FeishuChannel**: Wraps existing `FeishuAdapter` + `FeishuTokenManager`. Sends interactive card with approve/deny buttons. Handles callback via Feishu event subscription.
- **DingTalkChannel**: Wraps existing `DingTalkAdapter`. Uses DingTalk OA approval API.
- **WebhookChannel**: Generic outbound POST with configurable payload template. Inbound via `/api/approval/webhook/:channelId`.

### 5.4 External OA Inbound Flow

```
Feishu/DingTalk user clicks "Approve" button
  → Feishu/DingTalk sends callback to registered webhook URL
  → POST /api/approval/webhook/:channelId
  → ApprovalChannelGateway.handleInboundResponse(channelId, payload)
  → Parse payload → ApprovalDecision
  → ApprovalManager.respondToApproval(requestId, decision)
  → Session resume flow (InvocationQueue.enqueue with resumeCatId)
  → Agent resumes and executes approved tool
```

---

## 6. Agent-as-Approver

When `approverSpec.agentIds` contains authorized CatIds:

1. Gateway sends @mention to authorized agent via `InvocationQueue`:
   ```
   @security-cat [APPROVAL_REQUEST] office requests file_delete(path="/etc/config")
   Reason: cleaning expired config. Risk: dangerous.
   Use cat_cafe_respond_approval tool to approve or deny.
   ```
2. Authorized agent evaluates and calls MCP tool `cat_cafe_respond_approval`
3. Tool calls `POST /api/approval/respond` → `ApprovalManager.respondToApproval()`
4. Same flow as human approval from there

---

## 7. API Endpoints

```
# Approval lifecycle
POST   /api/approval/requests              (internal, from agent callback)
GET    /api/approval/requests              (list, filterable)
GET    /api/approval/requests/:id          (detail)
PATCH  /api/approval/requests/:id/cancel   (cancel pending)

# Approval response
POST   /api/approval/respond               (human or agent approve/deny)

# Tool policies
GET    /api/approval/policies
POST   /api/approval/policies
PUT    /api/approval/policies/:id
DELETE /api/approval/policies/:id
GET    /api/approval/policies/evaluate     (dry-run)

# Channels
GET    /api/approval/channels
POST   /api/approval/channels
PUT    /api/approval/channels/:id
DELETE /api/approval/channels/:id
POST   /api/approval/channels/:id/test

# Agent callbacks (MCP tool backends)
POST   /api/callbacks/request-tool-execution
GET    /api/callbacks/check-tool-policy
GET    /api/callbacks/check-execution-status

# External OA inbound
POST   /api/approval/webhook/:channelId

# Audit
GET    /api/approval/audit
```

---

## 8. File Organization

### New files:

```
packages/shared/src/types/approval.ts                    # Shared types
packages/api/src/domains/cats/services/approval/
  ApprovalManager.ts                                     # Core orchestrator
  ToolPolicyEngine.ts                                    # Policy matching
  ApprovalChannelGateway.ts                              # Channel dispatch
packages/api/src/domains/cats/services/stores/ports/
  ApprovalStore.ts                                       # Interface + in-memory
  ToolPolicyStore.ts                                     # Interface + in-memory
  SuspendedSessionStore.ts                               # Interface + in-memory
packages/api/src/domains/cats/services/stores/redis/
  RedisApprovalStore.ts                                  # Redis impl
  RedisToolPolicyStore.ts                                # Redis impl
  RedisSuspendedSessionStore.ts                          # Redis impl
packages/api/src/infrastructure/approval-channels/
  WebSocketApprovalChannel.ts                            # Built-in
  FeishuApprovalChannel.ts                               # Wraps FeishuAdapter
  DingTalkApprovalChannel.ts                             # Wraps DingTalkAdapter
  WebhookApprovalChannel.ts                              # Generic webhook
packages/api/src/routes/
  approval-center.ts                                     # REST API
  callback-approval.ts                                   # Agent callback routes
packages/mcp-server/src/tools/approval-tools.ts          # MCP tool handlers
packages/web/src/hooks/useApprovalCenter.ts              # React hook
packages/web/src/components/ApprovalCenterPage.tsx        # Dashboard
packages/web/src/components/ApprovalRequestCard.tsx       # Card UI

# Agent-side integration:
vendor/jiuwenclaw/.../permissions/cat_cafe_bridge.py     # Central API bridge
vendor/dare-cli/.../hook/cat_cafe_approval_hook.py       # Dare BEFORE_TOOL hook
```

### Modified files (backward-compatible additions only):

```
packages/mcp-server/src/server-toolsets.ts               # Add gateToolExecution() wrapper
packages/api/src/domains/cats/.../ACPAgentService.ts     # Extend handleACPControlMessage()
vendor/jiuwenclaw/.../react_agent.py                     # Extend _request_permission_approval()
vendor/jiuwenclaw/.../permissions/core.py                # Add remote policy sync
vendor/dare-cli/.../tool_executor.py                     # Register CatCafeApprovalHook
packages/shared/src/types/index.ts                       # Export new types
packages/api/src/index.ts                                # Wire new services
```

---

## 9. Key Architectural Decisions

1. **Three-layer interception**: Each agent framework has its own tool execution pipeline. Rather than forcing a single interception point, we integrate at each agent's natural extension point (jiuwenclaw permissions, dare hooks, MCP server wrapper).

2. **Central API as single source of truth**: All agent-side interceptors call the same `POST /api/callbacks/request-tool-execution` endpoint. Policy evaluation, approval state, and audit happen centrally.

3. **Wrap, don't replace**: `ApprovalManager` wraps existing `AuthorizationManager`. Agent-side permissions systems are extended, not replaced. Fallback to local approval when central server unavailable.

4. **Reuse CLI resume**: `InvocationQueue.resumeCatId`, `--resume` flag, ACP `session/resume` already exist. Session resumption after approval reuses these mechanisms.

5. **Long-lived requests in Redis**: OA workflows can take hours/days. `inFlightWaiters` kept as fast-path optimization for online approvers.

6. **Channel gateway composes existing adapters**: `FeishuAdapter`, `DingTalkAdapter` handle transport. Approval channels add approval-specific formatting.

---

## 10. Implementation Phases

| Phase | Scope | Agent Coverage |
|-------|-------|----------------|
| **P1** | ToolPolicyEngine + ApprovalStore + ApprovalManager + REST API | Gateway only |
| **P2** | MCP server `gateToolExecution()` wrapper + MCP approval tools | Claude/Codex agents |
| **P3** | Jiuwenclaw `_request_permission_approval()` bridge + policy sync | Jiuwenclaw agents |
| **P4** | Dare `CatCafeApprovalHook` + GovernedToolGateway extension | Dare agents |
| **P5** | ACP `handleACPControlMessage()` extension | relay-teams/ACP agents |
| **P6** | Session suspension/resumption via InvocationQueue | All agents |
| **P7** | WebSocket channel + ApprovalCenterPage UI | Frontend |
| **P8** | Feishu/DingTalk/Webhook channels | Enterprise OA |
| **P9** | Agent-as-approver + escalation timer | Advanced |
| **P10** | Multi-approver quorum + conditional policies | Advanced |

---

## 11. Verification Plan

1. **Unit**: ToolPolicyEngine glob matching, condition evaluation, priority resolution
2. **Unit**: ApprovalManager lifecycle transitions (pending → approved → executing)
3. **Integration (MCP)**: Claude agent calls gated tool → suspension → human approves → resume
4. **Integration (Jiuwenclaw)**: jiuwenclaw calls mcp_exec_command → central policy blocks → approval card → approve → resume
5. **Integration (Dare)**: dare agent BEFORE_TOOL hook fires → central API → suspend → approve → resume
6. **E2E**: Browser: agent calls dangerous tool → ApprovalCard appears → approve → agent resumes
7. **E2E**: Feishu: approval card sent → click approve → webhook → resume

---

## References

- OpenClaw Security: https://docs.openclaw.ai/gateway/security
- OpenClaw Safety Principles: https://zenvanriel.com/ai-engineer-blog/openclaw-safety-principles-automation-guide/
- AxonFlow + OpenClaw: https://docs.getaxonflow.com/docs/integration/openclaw/
