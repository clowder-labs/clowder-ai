# 错误消息持久化与测试钩子移除设计文档

## 背景与问题

### 当前问题

提交 `78ce6891` 引入了错误兜底逻辑，但存在两个问题：

1. **错误消息不落库**：前端在 `useAgentMessages.ts` 和 `useSocket-background.ts` 中拦截 `error` 事件，将其改写为友好的 assistant 消息，但这些改写后的消息只存在于前端内存（Zustand store），没有持久化到数据库。用户刷新页面后，兜底消息消失。

2. **测试钩子污染生产代码**：`invoke-single-cat.ts` 中引入了 `testHook` 逻辑，通过检查 prompt 中的特殊字符串（`__TEST_AGENT_TIMEOUT__` 等）来注入测试错误。这种做法不优雅，违反了生产代码与测试代码分离的原则。

### 根本原因

**消息持久化的唯一入口是 `messageStore.append()`**，调用点在：
- `route-serial.ts` 行 723（正常 assistant 消息）
- `route-serial.ts` 行 1025（错误 system 消息）
- `route-parallel.ts` 行 802（并行路由错误）

前端的 `addMessage()` 只是添加到内存 store，不会触发后端持久化。

## 设计方案

### 方案：流式阶段错误转换（推荐）

在 `route-serial.ts` 和 `route-parallel.ts` 的**流式循环**中，拦截 `error` 事件并转换为 `text` 消息，带上 `extra.errorFallback` 标记。

#### 核心思路

1. **流式阶段转换**：在 `error` 事件 yield 给前端之前，将其转换为友好的 `text` 消息
2. **自动持久化**：转换后的 `text` 消息会被累积到 `textContent`，走正常的持久化流程
3. **前端无感知**：前端收到的直接是友好消息，无需任何错误处理逻辑

#### 优势
- ✅ **流式与历史一致**：用户在流式阶段和刷新后看到的完全一样
- ✅ **架构更清晰**：错误转换完全在后端完成，前端只负责展示
- ✅ **统一转换点**：只在流式循环一处转换，持久化自动跟随
- ✅ **可维护性更高**：错误转换逻辑只在后端维护，前端代码更简洁

#### 劣势
- ⚠️ 需要将前端的 `agent-error-fallback.ts` 移植到后端（或抽取为共享模块）
- ⚠️ 需要同时修改 `route-serial.ts` 和 `route-parallel.ts` 两处

#### 重要改进（基于 Code Review）
1. **前端保留 error 处理作为降级**：不完全删除，保留状态清理和向后兼容
2. **流式循环改造需谨慎**：确保不影响 `done` 消息的缓冲和处理
3. **降级逻辑条件更精确**：使用 `hadErrorTransformed` 标记而非简单的 `!textContent`
4. **错误消息截断在共享模块**：统一在 `getFriendlyAgentErrorMessage` 中处理

---

## 实现细节

### 1. 创建共享错误转换模块

**位置**：`packages/shared/src/agent-error-transform.ts`

将前端的 `agent-error-fallback.ts` 移植为共享模块，供前后端使用。

**完整代码**：

```typescript
/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

export const MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE = 'ModelArts.81011';
const MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT = 'Input text May contain sensitive information';

export type ErrorFallbackKind =
  | 'timeout'           // 响应超时
  | 'connection'        // 连接失败
  | 'config'            // 配置错误
  | 'abrupt_exit'       // CLI 异常退出
  | 'max_iterations'    // 达到最大迭代次数
  | 'sensitive_input'   // 敏感词校验
  | 'unknown';          // 未分类错误

export interface ErrorFallbackMetadata {
  v: 1;
  kind: ErrorFallbackKind;
  rawError: string;
  timestamp: number;
}

export interface ErrorLike {
  catId?: string;
  error?: string;
  errorCode?: string;
  metadata?: { provider?: string; model?: string };
}

function normalizeQuotedText(rawError: string): string {
  return rawError.replace(/['']/g, "'").replace(/[""]/g, '"');
}

function isSensitiveInputError(msg: ErrorLike | string): boolean {
  if (typeof msg === 'string') {
    const normalized = normalizeQuotedText(msg);
    return (
      normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
      normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
    );
  }
  if (msg.errorCode === MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) return true;
  const rawError = msg.error?.trim();
  if (!rawError) return false;
  const normalized = normalizeQuotedText(rawError);
  return (
    normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
    normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
  );
}

function isTimeoutError(rawError: string): boolean {
  return /响应超时|timed out|timeout/i.test(rawError);
}

function isAbruptExitError(rawError: string): boolean {
  // 排除 "connection closed unexpectedly" 因为它应该归类为连接错误
  // 只匹配 CLI 异常退出相关的错误
  return /CLI\s*异常退出|abnormal exit|exited unexpectedly|subprocess exited/i.test(rawError);
}

function isConnectionError(rawError: string): boolean {
  return /connection failed|connection closed unexpectedly|WebSocket connection closed/i.test(rawError);
}

function isMaxIterationsReachedError(rawError: string): boolean {
  return /max iterations reached|max_iterations_reached/i.test(rawError);
}

type ConfigurationMatch = {
  pattern: RegExp;
  message: string;
};

const CONFIGURATION_MATCHES: ConfigurationMatch[] = [
  {
    pattern: /WebSocket URL is not configured/i,
    message: '当前智能体缺少 WebSocket 地址配置，暂时无法启动。请先配置对应智能体的连接地址后再重试。',
  },
  {
    pattern: /provider profile is not configured|bound provider profile/i,
    message: '当前智能体未绑定可用的 provider profile，暂时无法处理请求。请先检查并绑定正确的 provider profile。',
  },
  {
    pattern: /requires a default model profile|default model profile|model profile is missing/i,
    message: '当前智能体缺少默认 model profile 配置，暂时无法处理请求。请先为对应 provider profile 配置默认模型。',
  },
  {
    pattern: /model profile ".+" not found or missing apiKey|missing apiKey|API key/i,
    message:
      '当前智能体的模型配置缺少 API Key 或模型档案不存在，暂时无法处理请求。请检查对应 model profile 的 API Key 配置。',
  },
];

function isConfigurationError(rawError: string): boolean {
  return (
    CONFIGURATION_MATCHES.some(({ pattern }) => pattern.test(rawError)) ||
    /not configured|invalid|missing|incomplete|sidecar exited|CLI path/i.test(rawError)
  );
}

function getConfigurationErrorMessage(rawError: string): string {
  const matched = CONFIGURATION_MATCHES.find(({ pattern }) => pattern.test(rawError));
  if (matched) return matched.message;
  return `当前智能体配置存在问题，暂时无法处理这次请求。请检查配置后重试。原始错误：${rawError}`;
}

export function classifyError(rawError: string): ErrorFallbackKind {
  if (isSensitiveInputError(rawError)) return 'sensitive_input';
  if (isTimeoutError(rawError)) return 'timeout';
  if (isAbruptExitError(rawError)) return 'abrupt_exit';
  if (isConfigurationError(rawError)) return 'config';
  if (isConnectionError(rawError)) return 'connection';
  if (isMaxIterationsReachedError(rawError)) return 'max_iterations';
  return 'unknown';
}

export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  let rawError = msg.error?.trim() || 'Unknown error';

  // 截断过长的错误消息（统一在共享模块处理）
  const MAX_RAW_ERROR_LENGTH = 1000;
  if (rawError.length > MAX_RAW_ERROR_LENGTH) {
    rawError = rawError.slice(0, MAX_RAW_ERROR_LENGTH) + '... (truncated)';
  }

  if (isSensitiveInputError(msg)) {
    return '检测到输入内容触发了敏感词校验。请重新打开一个新会话后再试。';
  }

  if (isTimeoutError(rawError)) {
    return '这次响应超时了，我先结束本次尝试。请稍后直接重试。';
  }

  if (isAbruptExitError(rawError)) {
    return '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，请稍后再试。';
  }

  if (isConfigurationError(rawError)) {
    return getConfigurationErrorMessage(rawError);
  }

  if (isConnectionError(rawError)) {
    return '当前智能体连接不稳定，暂时无法完成这次处理。请稍后重试；如果持续出现，说明后端服务可能需要检查。';
  }

  if (isMaxIterationsReachedError(rawError)) {
    return '已达到本次对话允许的最大思考轮数，任务未在限定的轮数内完成。';
  }

  return '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。';
}
```

**导出到 `packages/shared/src/index.ts`**：

```typescript
export {
  getFriendlyAgentErrorMessage,
  classifyError,
  type ErrorFallbackKind,
  type ErrorFallbackMetadata,
  type ErrorLike,
} from './agent-error-transform.js';
```

### 2. 错误分类与标记

为了让前端能够区分"正常 assistant 回复"和"错误兜底回复"，需要在消息中添加结构化标记。

#### 2.1 类型定义（已包含在共享模块中）

```typescript
export type ErrorFallbackKind =
  | 'timeout'           // 响应超时
  | 'connection'        // 连接失败
  | 'config'            // 配置错误
  | 'abrupt_exit'       // CLI 异常退出
  | 'max_iterations'    // 达到最大迭代次数
  | 'sensitive_input'   // 敏感词校验
  | 'unknown';          // 未分类错误

export interface ErrorFallbackMetadata {
  v: 1;
  kind: ErrorFallbackKind;
  rawError: string;
  timestamp: number;
}
```

#### 2.2 前端类型扩展

在 `packages/web/src/stores/chat-types.ts` 中添加：

```typescript
import type { ErrorFallbackMetadata } from '@repo/shared';

export interface ChatMessage {
  // ... 现有字段
  extra?: {
    rich?: { v: 1; blocks: RichBlock[] };
    errorFallback?: ErrorFallbackMetadata;  // ← 新增
    stream?: {
      invocationId?: string;
      sessionId?: string;
    };
    // ... 其他字段
  };
}
```

### 3. 修改后端流式错误处理逻辑

#### 3.1 route-serial.ts 流式循环改造

**文件位置**：`packages/api/src/domains/cats/services/agents/routing/route-serial.ts`

**修改位置 1：导入共享模块**（文件顶部）

```typescript
import { getFriendlyAgentErrorMessage, classifyError } from '@repo/shared';
```

**修改位置 2：流式循环中的 error 事件处理**（行 528-554）

**当前代码**：
```typescript
if (msg.type === 'error') {
  hadError = true;
  if (msg.error) {
    collectedErrorText += `${collectedErrorText ? '\n' : ''}${msg.error}`;
  }
}
// ...
if (msg.type === 'done') {
  doneMsg = msg; // Buffer — yield after A2A detection
} else {
  // Tag CLI stdout text with origin: 'stream' (thinking/internal)
  yield msg.type === 'text'
    ? {
        ...msg,
        origin: 'stream' as const,
        ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
        ...(streamReplyPreview ? { replyPreview: streamReplyPreview } : {}),
      }
    : msg;  // ← error 事件在这里直接 yield
}
```

**改进后**：
```typescript
// 在流式循环开始前添加标记
let hadErrorTransformed = false;

// 在流式循环中
if (msg.type === 'error') {
  hadError = true;
  const rawError = msg.error ?? '';

  // 收集原始错误（用于日志/审计）
  if (rawError) {
    collectedErrorText += `${collectedErrorText ? '\n' : ''}${rawError}`;
  }

  // ✨ 转换为友好的 text 消息
  const errorKind = classifyError(rawError);
  const friendlyMessage = getFriendlyAgentErrorMessage({
    catId: msg.catId,
    error: rawError,
    errorCode: msg.errorCode,
    metadata: msg.metadata,
  });

  // 累积到 textContent（和正常 text 一样，用于持久化）
  textContent += friendlyMessage;
  hadErrorTransformed = true; // 标记已转换

  // 构造转换后的消息
  const transformedMsg = {
    type: 'text' as const,
    catId: msg.catId,
    content: friendlyMessage,
    timestamp: msg.timestamp,
    metadata: msg.metadata,
    origin: 'stream' as const,
    ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
    ...(streamReplyPreview ? { replyPreview: streamReplyPreview } : {}),
    extra: {
      errorFallback: {
        v: 1 as const,
        kind: errorKind,
        rawError,
        timestamp: msg.timestamp,
      },
    },
  };

  // yield 转换后的消息（而不是原始 error）
  yield transformedMsg;
  continue;  // ✅ 跳过后面的逻辑，但不影响后续消息处理
}

// F070: done with errorCode (e.g. GOVERNANCE_BOOTSTRAP_REQUIRED) is an error
// state — mark hadError so we don't fall through to silent_completion.
if (msg.type === 'done' && msg.errorCode) {
  hadError = true;
}
if (msg.metadata && !firstMetadata) {
  firstMetadata = msg.metadata;
}
if (msg.type === 'done') {
  doneMsg = msg; // Buffer — yield after A2A detection
} else {
  // Tag CLI stdout text with origin: 'stream' (thinking/internal)
  // error 已在上面 continue，不会到达这里
  yield msg.type === 'text'
    ? {
        ...msg,
        origin: 'stream' as const,
        ...(streamReplyTo ? { replyTo: streamReplyTo } : {}),
        ...(streamReplyPreview ? { replyPreview: streamReplyPreview } : {}),
      }
    : msg;
}
```

**关键点**：
1. ✅ 在 `if (msg.type === 'error')` 块内完成转换并 `yield`，然后 `continue` 跳过后续逻辑
2. ✅ `continue` 只跳过当前迭代，不影响后续消息（包括 `done`）的处理
3. ✅ 累积到 `textContent` 确保持久化时能走正常的 text 分支
4. ✅ 保留 `collectedErrorText` 用于日志/审计
5. ✅ 添加 `hadErrorTransformed` 标记，用于降级逻辑判断
6. ✅ 保留 `streamReplyTo` 和 `streamReplyPreview` 字段（如果存在）

**修改位置 3：改进旧的错误持久化逻辑为降级**（行 1020-1037）

**当前代码**：
```typescript
// Persist error as system message so it survives F5 reload.
// During streaming, errors render as red badges via ephemeral frontend state.
// Without persistence, they vanish on page refresh.
if (collectedErrorText) {
  try {
    await deps.messageStore.append({
      userId: 'system',
      catId: null,
      content: `Error: ${collectedErrorText}`,
      mentions: [],
      origin: 'stream',
      timestamp: Date.now(),
      threadId,
    });
  } catch (err) {
    log.error({ catId: catId as string, err }, 'messageStore.append (error system msg) failed');
  }
}
```

**改进后（使用 hadErrorTransformed 标记）**：
```typescript
// 降级逻辑：仅在错误未被流式循环转换时触发
// 这种情况理论上不应该发生，但保留作为安全网
if (collectedErrorText && !hadErrorTransformed) {
  log.warn(
    { catId: catId as string, collectedErrorText },
    'Error not transformed in stream loop — fallback persistence',
  );
  const errorKind = classifyError(collectedErrorText);
  const friendlyMessage = getFriendlyAgentErrorMessage({
    catId: catId as string,
    error: collectedErrorText,
  });

  try {
    await deps.messageStore.append({
      userId,           // ← 改为 userId（而非 'system'）
      catId,            // ← 改为 catId（而非 null）
      content: friendlyMessage,  // ← 友好消息（而非 "Error: ..."）
      mentions: [],
      origin: 'stream',
      timestamp: Date.now(),
      threadId,
      extra: {
        errorFallback: {
          v: 1,
          kind: errorKind,
          rawError: collectedErrorText,
          timestamp: Date.now(),
        },
      },
    });
  } catch (err) {
    log.error({ catId: catId as string, err }, 'messageStore.append (error fallback) failed');
  }
}
```

#### 3.2 route-parallel.ts 同步改造

**文件位置**：`packages/api/src/domains/cats/services/agents/routing/route-parallel.ts`

需要应用相同的改动：

1. **导入共享模块**（文件顶部）
2. **在流式循环中转换 error 事件**（查找 `if (msg.type === 'error')` 的位置）
3. **移除或改造旧的错误持久化逻辑**（查找 `userId: 'system'` 的位置）

**注意**：`route-parallel.ts` 的结构可能与 `route-serial.ts` 略有不同，需要根据实际代码调整。核心逻辑相同：
- 拦截 `error` 事件
- 转换为 `text` 消息
- 添加 `extra.errorFallback` 标记
- 累积到 `textContent`

### 4. 前端改动

#### 4.1 前端保留 error 处理作为降级（重要改进）

由于后端部署可能失败需要回滚，前端不应完全删除 error 事件处理逻辑。应保留作为降级和状态清理。

**文件 1：`packages/web/src/hooks/useAgentMessages.ts`**

**修改位置**：行 1092-1162

**改进后（保留降级逻辑）**：
```typescript
} else if (msg.type === 'error') {
  // 理论上后端已转换为 text 消息，但保留降级处理
  log.warn({ catId: msg.catId }, 'Received raw error event (backend not upgraded or error in transformation)');

  // 状态清理逻辑（必须保留）
  setCatStatus(msg.catId, 'error');
  terminalStreamSuppressionRef.current.set(msg.catId, msg.invocationId ?? getCurrentInvocationIdForCat(msg.catId) ?? null);

  const currentProgress = useChatStore.getState().catInvocations?.[msg.catId]?.taskProgress;
  if (currentProgress?.tasks?.length) {
    setCatInvocation(msg.catId, {
      taskProgress: {
        ...currentProgress,
        snapshotStatus: 'interrupted',
        interruptReason: msg.error ?? 'Unknown error',
        lastUpdate: Date.now(),
      },
    });
  }

  const messageId = getOrRecoverActiveAssistantMessageId(msg.catId);
  if (messageId) {
    setStreaming(messageId, false);
    activeRefs.current.delete(msg.catId);
  }

  if (msg.catId) pendingTimeoutDiagRef.current.delete(msg.catId);

  recordDebugEvent({
    event: 'agent_message',
    threadId: useChatStore.getState().currentThreadId,
    timestamp: Date.now(),
    catId: msg.catId,
    invocationId: msg.invocationId,
    reason: msg.error ?? 'Unknown error',
    action: 'error_fallback_frontend_degradation',
    origin: msg.origin,
  });

  // Toast 通知（降级）
  const toast = getAgentErrorToastContent(msg);
  useToastStore.getState().addToast({
    type: 'error',
    title: toast.title,
    message: toast.message,
    threadId: useChatStore.getState().currentThreadId,
    duration: 8000,
  });

  // 清理 loading 状态
  if (msg.isFinal) {
    clearDoneTimeout();
    setLoading(false);

    if (msg.invocationId) {
      removeActiveInvocation(msg.invocationId);
      const stateAfter = useChatStore.getState();
      const orphan = findLatestActiveInvocationIdForCat(stateAfter.activeInvocations, msg.catId);
      if (orphan?.startsWith('hydrated-')) {
        removeActiveInvocation(orphan);
      }
    } else {
      const catSlot = findLatestActiveInvocationIdForCat(useChatStore.getState().activeInvocations, msg.catId);
      if (catSlot) {
        removeActiveInvocation(catSlot);
      } else {
        setHasActiveInvocation(false);
      }
    }
    setIntentMode(null);

    for (const ref of activeRefs.current.values()) {
      setStreaming(ref.id, false);
    }
    activeRefs.current.clear();
  }
}
```

**关键改进**：
1. ✅ 保留所有状态清理逻辑（这些是必要的）
2. ✅ 添加日志警告，便于监控是否有未转换的 error 事件
3. ✅ 修改 debug event action 为 `error_fallback_frontend_degradation`，便于区分
4. ⚠️ **不再添加消息到 store**（因为后端已持久化，避免重复）

**文件 2：`packages/web/src/hooks/useSocket-background.ts`**

**修改位置**：行 476-503

**改进后（保留降级逻辑）**：
```typescript
if (msg.type === 'error') {
  // 理论上后端已转换，但保留降级处理
  log.warn({ catId: msg.catId, threadId: msg.threadId }, 'Received raw error event in background');

  markThreadInvocationActive(msg, options);
  stopTrackedStream(streamKey, msg, options);

  recordDebugEvent({
    event: 'agent_message',
    threadId: msg.threadId,
    timestamp: msg.timestamp,
    catId: msg.catId,
    invocationId: msg.invocationId,
    reason: msg.error ?? 'Unknown error',
    action: 'error_fallback_background_degradation',
    origin: msg.origin,
  });

  options.store.updateThreadCatStatus(msg.threadId, msg.catId, 'error');

  if (msg.isFinal) {
    options.clearDoneTimeout?.(msg.threadId);
    markThreadInvocationComplete(msg, options);
  }

  // Toast 通知（降级）
  const toast = getAgentErrorToastContent(msg);
  options.addToast({
    type: 'error',
    title: toast.title,
    message: toast.message,
    threadId: msg.threadId,
    duration: 8000,
  });
  return;
}
```

**文件 3：`packages/web/src/hooks/agent-error-fallback.ts`**

**改进后（保留并标记为降级）**：
```typescript
// 保留此文件作为前端降级路径
// 当后端未转换 error 事件时，前端仍可使用这些函数
// 注意：共享模块已创建，未来可考虑统一导入

export {
  getFriendlyAgentErrorMessage,
  getAgentErrorToastContent,
  isSensitiveInputAgentError,
  getSensitiveInputErrorToastContent,
  type ErrorLike,
} from '@repo/shared';

// 或者保留原有实现作为降级（如果共享模块导入失败）
```

#### 4.2 添加类型定义

**文件**：`packages/web/src/stores/chat-types.ts`

**修改位置**：`ChatMessage` 接口的 `extra` 字段

**当前代码**：
```typescript
export interface ChatMessage {
  // ... 其他字段
  extra?: {
    rich?: { v: 1; blocks: RichBlock[] };
    stream?: {
      invocationId?: string;
      sessionId?: string;
    };
    // ... 其他字段
  };
}
```

**改进后**：
```typescript
import type { ErrorFallbackMetadata } from '@repo/shared';

export interface ChatMessage {
  // ... 其他字段
  extra?: {
    rich?: { v: 1; blocks: RichBlock[] };
    errorFallback?: ErrorFallbackMetadata;  // ← 新增
    stream?: {
      invocationId?: string;
      sessionId?: string;
    };
    // ... 其他字段
  };
}
```

#### 4.3 前端可选的差异化处理（未来增强）

前端可以通过检查 `extra.errorFallback` 字段来识别兜底消息，并做差异化处理：

**示例 1：显示错误类型标签**

**文件**：`packages/web/src/components/ChatMessage.tsx`

```typescript
const ERROR_KIND_LABELS: Record<ErrorFallbackKind, string> = {
  timeout: '超时',
  connection: '连接异常',
  config: '配置错误',
  abrupt_exit: '异常退出',
  max_iterations: '达到最大轮数',
  sensitive_input: '敏感词',
  unknown: '未知错误',
};

// 在消息渲染中添加
{message.extra?.errorFallback && (
  <span className="text-xs text-red-500 ml-2">
    [{ERROR_KIND_LABELS[message.extra.errorFallback.kind]}]
  </span>
)}
```

**示例 2：显示重试按钮**

```tsx
{message.extra?.errorFallback && (
  <button
    className="text-sm text-blue-500 hover:underline mt-2"
    onClick={() => retryLastMessage()}
  >
    重试
  </button>
)}
```

**示例 3：埋点上报**

```typescript
// 在 text 消息处理中添加
if (msg.extra?.errorFallback) {
  analytics.track('agent_error_fallback', {
    catId: msg.catId,
    errorKind: msg.extra.errorFallback.kind,
    rawError: msg.extra.errorFallback.rawError,
    timestamp: msg.extra.errorFallback.timestamp,
  });
}
```

**示例 4：Toast 通知（可选，因为后端已转换为友好消息）**

```typescript
// 如果需要在流式阶段弹 toast（而不是在历史回放时）
if (msg.extra?.errorFallback && msg.origin === 'stream') {
  const toast = {
    type: 'error' as const,
    title: `${msg.catId} 出错`,
    message: `${msg.content} [${ERROR_KIND_LABELS[msg.extra.errorFallback.kind]}]`,
    duration: 8000,
  };
  useToastStore.getState().addToast(toast);
}
```

## 前端 assistant 与 system 消息的区别

### 消息类型对比

| 特性 | assistant 消息 | system 消息 |
|------|---------------|-------------|
| **展示样式** | 正常对话气泡，有猫头像/名称/配色 | 中间提示条，无头像 |
| **用户感知** | "这是某个智能体说的话" | "这是系统通知/状态" |
| **支持功能** | thinking / toolEvents / rich blocks | 仅支持特殊 variant（error/info/tool） |
| **持久化字段** | `userId: <actual-user>`, `catId: <cat-id>` | `userId: 'system'`, `catId: null` |
| **前端类型** | `type: 'assistant'` | `type: 'system'` |

### 当前问题

后端现在将错误持久化为：

```typescript
userId: 'system',
catId: null,
content: `Error: ${collectedErrorText}`,
```

这类记录在历史恢复时，会被前端当成 **system 消息**（中间提示条），而不是 **assistant 消息**（正常对话气泡）。

前端流式处理中，错误被改写成了 assistant 消息，所以用户看到的是：
- **流式当下**：像猫在说话（assistant 气泡）
- **刷新后**：像系统报错条（system 提示条）

这就是"不一致"的核心问题。

### 解决方案

将错误消息持久化为 **assistant 消息**，并通过 `extra.errorFallback` 标记来区分"正常回复"和"错误兜底"。

---

## 错误兜底标记设计

### 为什么需要标记

如果后端做了兜底之后，前端需要能够识别"正常响应"和"兜底响应"，以便：

1. **显示错误类型标签**：例如"超时""连接异常""配置错误"
2. **决定是否展示重试按钮**：正常消息不展示，兜底消息可以展示
3. **决定是否上报埋点**：区分"真实成功回答" vs "错误兜底回答"
4. **决定是否 toast**：流式阶段收到 fallback 时可弹 toast，历史回放时不重复弹
5. **后续做统计**：哪类错误最常见、哪个 provider 最不稳定

### 不推荐的做法

1. **只靠文案猜**：通过是否包含"这次响应超时了"等文案来判断 → 文案一改就坏
2. **继续用 system message**：虽然能区分，但会失去"像正常 assistant 回复一样持久展示"的效果

### 推荐做法

通过结构化字段 `extra.errorFallback` 来标记：

```typescript
{
  userId,
  catId,
  content: friendlyMessage,
  origin: 'stream',
  extra: {
    errorFallback: {
      v: 1,
      kind: 'timeout',
      rawError: collectedErrorText,
      timestamp: Date.now(),
    },
  },
}
```

这样前端就可以明确判断：
- `extra?.errorFallback` 存在 → 这是兜底消息
- 不存在 → 这是正常 assistant 消息

---

### 5. 测试用例设计

#### 5.1 单元测试：错误分类函数

**文件**：`packages/shared/src/__tests__/agent-error-transform.test.ts`（新建）

```typescript
import { describe, it, expect } from 'vitest';
import { classifyError, getFriendlyAgentErrorMessage } from '../agent-error-transform';

describe('classifyError', () => {
  it('should classify timeout errors', () => {
    expect(classifyError('CLI 响应超时 (1800s)')).toBe('timeout');
    expect(classifyError('Request timed out after 30s')).toBe('timeout');
    expect(classifyError('Connection timeout')).toBe('timeout');
  });

  it('should classify connection errors', () => {
    expect(classifyError('WebSocket connection closed unexpectedly')).toBe('connection');
    expect(classifyError('Connection failed: ECONNREFUSED')).toBe('connection');
  });

  it('should classify configuration errors', () => {
    expect(classifyError('WebSocket URL is not configured')).toBe('config');
    expect(classifyError('Provider profile is not configured')).toBe('config');
    expect(classifyError('Missing API key for model profile')).toBe('config');
  });

  it('should classify abrupt exit errors', () => {
    expect(classifyError('CLI 异常退出 (code 1)')).toBe('abrupt_exit');
    expect(classifyError('Subprocess exited unexpectedly')).toBe('abrupt_exit');
  });

  it('should classify max iterations errors', () => {
    expect(classifyError('Max iterations reached (100)')).toBe('max_iterations');
    expect(classifyError('max_iterations_reached')).toBe('max_iterations');
  });

  it('should classify sensitive input errors', () => {
    expect(classifyError('ModelArts.81011: Input text May contain sensitive information')).toBe('sensitive_input');
  });

  it('should classify unknown errors', () => {
    expect(classifyError('Some random error')).toBe('unknown');
    expect(classifyError('')).toBe('unknown');
  });
});

describe('getFriendlyAgentErrorMessage', () => {
  it('should return friendly message for timeout', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'codex',
      error: 'CLI 响应超时 (1800s)',
    });
    expect(msg).toContain('响应超时');
    expect(msg).toContain('重试');
  });

  it('should return friendly message for connection error', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'dare',
      error: 'WebSocket connection closed unexpectedly',
    });
    expect(msg).toContain('连接不稳定');
  });

  it('should return friendly message for config error', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'gemini',
      error: 'WebSocket URL is not configured',
    });
    expect(msg).toContain('配置');
  });

  it('should handle empty error gracefully', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'opus',
      error: '',
    });
    expect(msg).toBeTruthy();
    expect(msg).not.toContain('Unknown error');
  });
});
```

#### 5.2 集成测试：流式错误转换

**文件**：`packages/api/test/route-serial-error-transform.test.js`（新建）

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { routeSerial } from '../src/domains/cats/services/agents/routing/route-serial.js';
import { makeDeps, collect } from './helpers/agent-registry-helpers.js';

/**
 * Mock AgentService that yields error messages
 */
function createErrorAgentService(catId, errorMessage, errorAfterMessages = 0) {
  return {
    invoke: async function* () {
      // Yield some text messages first (if specified)
      for (let i = 0; i < errorAfterMessages; i++) {
        yield {
          type: 'text',
          catId,
          content: `Message ${i + 1}`,
          timestamp: Date.now(),
        };
      }

      // Yield error
      yield {
        type: 'error',
        catId,
        error: errorMessage,
        timestamp: Date.now(),
      };

      // Yield done
      yield { type: 'done', catId, timestamp: Date.now() };
    },
  };
}

describe('route-serial error transformation', () => {
  it('should transform timeout error to friendly text message', async () => {
    const deps = makeDeps();
    const errorService = createErrorAgentService('codex', 'CLI 响应超时 (1800s)');

    const msgs = await collect(
      routeSerial(deps, {
        catId: 'codex',
        service: errorService,
        prompt: 'test',
        userId: 'user1',
        threadId: 'thread-timeout',
        isLastCat: true,
      }),
    );

    // Should NOT have error message
    assert.ok(!msgs.some(m => m.type === 'error'), 'Should not yield error message');

    // Should have text message with friendly content
    const textMsg = msgs.find(m => m.type === 'text');
    assert.ok(textMsg, 'Should have text message');
    assert.ok(textMsg.content.includes('响应超时'), 'Should contain friendly message');

    // Should have errorFallback metadata
    assert.ok(textMsg.extra?.errorFallback, 'Should have errorFallback metadata');
    assert.equal(textMsg.extra.errorFallback.kind, 'timeout', 'Should classify as timeout');
    assert.ok(textMsg.extra.errorFallback.rawError, 'Should preserve raw error');
  });

  it('should transform connection error to friendly text message', async () => {
    const deps = makeDeps();
    const errorService = createErrorAgentService('dare', 'WebSocket connection closed unexpectedly');

    const msgs = await collect(
      routeSerial(deps, {
        catId: 'dare',
        service: errorService,
        prompt: 'test',
        userId: 'user1',
        threadId: 'thread-connection',
        isLastCat: true,
      }),
    );

    const textMsg = msgs.find(m => m.type === 'text');
    assert.ok(textMsg, 'Should have text message');
    assert.ok(textMsg.content.includes('连接不稳定'), 'Should contain friendly message');
    assert.equal(textMsg.extra?.errorFallback?.kind, 'connection', 'Should classify as connection');
  });

  it('should transform config error to friendly text message', async () => {
    const deps = makeDeps();
    const errorService = createErrorAgentService('gemini', 'WebSocket URL is not configured');

    const msgs = await collect(
      routeSerial(deps, {
        catId: 'gemini',
        service: errorService,
        prompt: 'test',
        userId: 'user1',
        threadId: 'thread-config',
        isLastCat: true,
      }),
    );

    const textMsg = msgs.find(m => m.type === 'text');
    assert.ok(textMsg, 'Should have text message');
    assert.ok(textMsg.content.includes('配置'), 'Should contain friendly message');
    assert.equal(textMsg.extra?.errorFallback?.kind, 'config', 'Should classify as config');
  });

  it('should handle error after some text messages', async () => {
    const deps = makeDeps();
    const errorService = createErrorAgentService('opus', 'Some error', 2);

    const msgs = await collect(
      routeSerial(deps, {
        catId: 'opus',
        service: errorService,
        prompt: 'test',
        userId: 'user1',
        threadId: 'thread-mixed',
        isLastCat: true,
      }),
    );

    const textMsgs = msgs.filter(m => m.type === 'text');
    assert.equal(textMsgs.length, 3, 'Should have 3 text messages (2 normal + 1 error)');

    const errorMsg = textMsgs[2];
    assert.ok(errorMsg.extra?.errorFallback, 'Last message should be error fallback');
  });

  it('should persist transformed error message to messageStore', async () => {
    const deps = makeDeps();
    const errorService = createErrorAgentService('codex', 'CLI 响应超时 (1800s)');

    await collect(
      routeSerial(deps, {
        catId: 'codex',
        service: errorService,
        prompt: 'test',
        userId: 'user1',
        threadId: 'thread-persist',
        isLastCat: true,
      }),
    );

    // Check messageStore.append was called
    const appendCalls = deps.messageStore.append.mock?.calls || [];
    const errorMsg = appendCalls.find(call => call[0].extra?.errorFallback);

    assert.ok(errorMsg, 'Should persist error message');
    assert.equal(errorMsg[0].userId, 'user1', 'Should use userId, not "system"');
    assert.equal(errorMsg[0].catId, 'codex', 'Should use catId, not null');
    assert.ok(errorMsg[0].content.includes('响应超时'), 'Should contain friendly message');
    assert.equal(errorMsg[0].extra.errorFallback.kind, 'timeout', 'Should classify as timeout');
  });
});
```

#### 5.3 端到端测试：前端显示一致性

**文件**：`packages/web/src/components/__tests__/error-message-consistency.test.ts`（新建）

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../ChatMessage';
import type { ChatMessage as ChatMessageType } from '../../stores/chat-types';

describe('Error message display consistency', () => {
  it('should display error fallback message as assistant message', () => {
    const message: ChatMessageType = {
      id: 'msg-1',
      type: 'assistant',
      catId: 'codex',
      content: '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
      timestamp: Date.now(),
      extra: {
        errorFallback: {
          v: 1,
          kind: 'timeout',
          rawError: 'CLI 响应超时 (1800s)',
          timestamp: Date.now(),
        },
      },
    };

    render(<ChatMessage message={message} />);

    // Should display as assistant message (not system message)
    expect(screen.getByText(/响应超时/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // system messages use alert role
  });

  it('should NOT display old-style system error message', () => {
    const message: ChatMessageType = {
      id: 'msg-2',
      type: 'system',
      userId: 'system',
      catId: null,
      content: 'Error: CLI 响应超时 (1800s)',
      timestamp: Date.now(),
      variant: 'error',
    };

    render(<ChatMessage message={message} />);

    // Should display as system message (middle alert bar)
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should optionally display error kind label', () => {
    const message: ChatMessageType = {
      id: 'msg-3',
      type: 'assistant',
      catId: 'dare',
      content: '当前智能体连接不稳定，暂时无法完成这次处理。',
      timestamp: Date.now(),
      extra: {
        errorFallback: {
          v: 1,
          kind: 'connection',
          rawError: 'WebSocket connection closed',
          timestamp: Date.now(),
        },
      },
    };

    render(<ChatMessage message={message} showErrorKind />);

    // Should display error kind label (if implemented)
    expect(screen.queryByText(/连接异常/)).toBeInTheDocument();
  });
});
```

---

### 6. 边界情况处理

#### 6.1 多个连续错误

**场景**：AgentService 连续 yield 多个 error 事件

**当前行为**：每个 error 都会被转换为独立的 text 消息

**处理方案**：
```typescript
// 在 route-serial.ts 流式循环中
let errorCount = 0;
const MAX_ERROR_MESSAGES = 3;

if (msg.type === 'error') {
  hadError = true;
  const rawError = msg.error ?? '';

  if (rawError) {
    collectedErrorText += `${collectedErrorText ? '\n' : ''}${rawError}`;
  }

  // 限制错误消息数量，避免刷屏
  errorCount++;
  if (errorCount > MAX_ERROR_MESSAGES) {
    log.warn({ catId: msg.catId, errorCount }, 'Too many error messages, skipping');
    continue;
  }

  // ... 转换逻辑
}
```

#### 6.2 空错误消息

**场景**：`msg.error` 为空字符串或 undefined

**当前行为**：`getFriendlyAgentErrorMessage` 会返回默认兜底消息

**处理方案**：已在共享模块中处理
```typescript
export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  const rawError = msg.error?.trim() || 'Unknown error';
  // ... 分类逻辑
  return '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。';
}
```

#### 6.3 错误消息过长

**场景**：`rawError` 包含大量堆栈信息（超过 1000 字符）

**处理方案**：在共享模块的 `getFriendlyAgentErrorMessage` 中统一处理（已在第 1 节实现）

```typescript
// 已在 packages/shared/src/agent-error-transform.ts 中实现
export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  let rawError = msg.error?.trim() || 'Unknown error';

  // 截断过长的错误消息
  const MAX_RAW_ERROR_LENGTH = 1000;
  if (rawError.length > MAX_RAW_ERROR_LENGTH) {
    rawError = rawError.slice(0, MAX_RAW_ERROR_LENGTH) + '... (truncated)';
  }

  // ... 分类逻辑
}
```

#### 6.4 错误发生在流式循环外

**场景**：错误在 `for await (const msg of stream)` 循环外产生（例如 catch 块）

**当前行为**：会走降级持久化逻辑（行 1020-1037）

**处理方案**：保留降级逻辑，使用 `hadErrorTransformed` 标记判断
```typescript
// 在 route-serial.ts 行 1020-1037
if (collectedErrorText && !hadErrorTransformed) {
  log.warn(
    { catId: catId as string, collectedErrorText },
    'Error not transformed in stream loop — fallback persistence',
  );
  // ... 降级持久化逻辑（已在第 3.1 节实现）
}
```

#### 6.5 并发错误（route-parallel.ts）

**场景**：多个 cat 同时出错

**处理方案**：每个 cat 的错误独立转换
```typescript
// 在 route-parallel.ts 中
for (const catId of catIds) {
  const stream = streams[catId];
  for await (const msg of stream) {
    if (msg.type === 'error') {
      // 每个 cat 独立转换错误
      const errorKind = classifyError(msg.error ?? '');
      const friendlyMessage = getFriendlyAgentErrorMessage({
        catId: msg.catId,
        error: msg.error,
      });
      // ... yield 转换后的消息
    }
  }
}
```

#### 6.6 历史消息兼容

**场景**：数据库中存在旧格式的错误消息（`userId: 'system'`, `catId: null`）

**处理方案**：前端保留兼容逻辑
```typescript
// 在 ChatMessage.tsx 中
const isSystemMessage = message.type === 'system' ||
  (message.userId === 'system' && message.catId === null);

if (isSystemMessage) {
  // 渲染为 system 提示条
  return <SystemMessageBar content={message.content} />;
}

// 渲染为 assistant 气泡
return <AssistantBubble message={message} />;
```

**可选**：运行一次性迁移脚本（见 Phase 4）

#### 6.7 前端降级（后端未部署）

**场景**：后端尚未部署新版本，前端仍收到原始 `error` 事件

**处理方案**：前端保留 error 事件处理作为降级（已在第 4.1 节实现）

```typescript
// 在 useAgentMessages.ts 中（已保留）
} else if (msg.type === 'error') {
  // 降级处理：后端未转换时，前端兜底
  log.warn({ catId: msg.catId }, 'Received raw error event (backend not upgraded?)');

  // 保留所有状态清理逻辑
  setCatStatus(msg.catId, 'error');
  // ... 其他状态清理

  // Toast 通知（降级）
  const toast = getAgentErrorToastContent(msg);
  useToastStore.getState().addToast({...});

  if (msg.isFinal) {
    clearDoneTimeout();
    setLoading(false);
    // ... 清理 invocation
  }
}
```

#### 6.8 错误消息中包含敏感信息

**场景**：`rawError` 包含 API Key、密码等敏感信息

**处理方案**：在持久化前脱敏
```typescript
// 在 route-serial.ts 中
function sanitizeError(rawError: string): string {
  return rawError
    .replace(/apiKey[=:]\s*["']?[a-zA-Z0-9_-]+["']?/gi, 'apiKey=***')
    .replace(/password[=:]\s*["']?[^\s"']+["']?/gi, 'password=***')
    .replace(/token[=:]\s*["']?[a-zA-Z0-9_-]+["']?/gi, 'token=***');
}

if (msg.type === 'error') {
  hadError = true;
  let rawError = msg.error ?? '';

  // 脱敏处理
  const sanitizedError = sanitizeError(rawError);

  // 使用脱敏后的错误进行转换和持久化
  const errorKind = classifyError(sanitizedError);
  const friendlyMessage = getFriendlyAgentErrorMessage({
    catId: msg.catId,
    error: sanitizedError,
  });

  // ... 转换逻辑
}
```

---

### 7. 测试钩子移除（如果存在）

#### 7.1 问题分析

探索结果显示：**当前代码库中没有发现 `testHook` 或 `__TEST_*__` 标记**。

这意味着：
1. 提交 `78ce6891` 可能已经被后续提交覆盖或回滚
2. 或者测试钩子在另一个分支/提交中

#### 5.2 推荐做法（如果测试钩子存在）

**不要在生产代码中检查特殊字符串**，而是通过 **依赖注入** mock `AgentService`。

**删除测试钩子逻辑**（如果存在）：
```typescript
// ❌ 删除这段代码
const testHook = prompt.includes('__TEST_AGENT_TIMEOUT__')
  ? 'timeout'
  : prompt.includes('__TEST_AGENT_EXIT__')
    ? 'exit'
    : prompt.includes('__TEST_AGENT_CONNECTION__')
      ? 'connection'
      : prompt.includes('__TEST_AGENT_CONFIG__')
        ? 'config'
        : null;

if (testHook) {
  // ... 测试钩子逻辑
}
```

**改用依赖注入 mock AgentService**：

```typescript
// test/invoke-single-cat.test.js
it('should handle agent timeout error', async () => {
  const mockAgentService = {
    async *invoke() {
      yield { type: 'error', error: 'Agent timeout after 30s', catId: 'test-cat' };
    },
  };

  // 注入 mock service
  const result = await invokeSingleCat({
    ...deps,
    agentService: mockAgentService,  // ← 依赖注入
  });

  // 验证错误被转换为友好消息
  expect(result.messages).toContainEqual(
    expect.objectContaining({
      type: 'text',
      content: expect.stringContaining('响应超时'),
      extra: expect.objectContaining({
        errorFallback: expect.objectContaining({
          kind: 'timeout',
        }),
      }),
    }),
  );
});
```

**优势**：
- ✅ 不污染生产代码
- ✅ 测试更清晰（直接 mock 错误场景）
- ✅ 可以测试各种错误类型（timeout/connection/config/unknown）
        catId,
        content: responseText,
        timestamp: Date.now(),
      };

      if (errorMessage && errorAfterMessages > 0) {
        yield {
          type: 'error',
          catId,
          error: errorMessage,
          timestamp: Date.now(),
        };
      }
    }

    yield { type: 'done', catId, timestamp: Date.now() };
  });

  return { invoke };
}
```

#### 使用示例

```javascript
it('handles timeout error gracefully', async () => {
  const errorService = createMockAgentService('codex', {
    errorMessage: 'CLI 响应超时 (1800s)',
    errorAfterMessages: 0,
  });

  const msgs = await collect(
    invokeSingleCat(makeDeps(), {
      catId: 'codex',
      service: errorService,
      prompt: 'test',
      userId: 'user1',
      threadId: 'thread-timeout',
      isLastCat: true,
    }),
  );

  assert.ok(msgs.some(m => m.type === 'error'));
});
```

---

## 实施步骤

### Phase 1: 后端改造（核心）

1. **创建共享的错误转换模块**
   - 位置：`packages/shared/src/agent-error-fallback.ts`
   - 从前端 `agent-error-fallback.ts` 移植 `classifyError()` 和 `getFriendlyAgentErrorMessage()`
   - 导出 `ErrorFallbackKind` 类型

2. **修改 route-serial.ts 流式错误处理**
   - 在 `error` 事件处理中（行 528-554）转换为 `text` 消息
   - 添加 `extra.errorFallback` 标记
   - 累积到 `textContent` 变量

3. **移除或改造旧的错误持久化逻辑**
   - 删除行 1020-1037 的错误持久化代码
   - 或改为降级逻辑（仅在 `!textContent` 时触发）

4. **同步修改 route-parallel.ts**
   - 应用相同的流式错误转换逻辑
   - 移除或改造旧的错误持久化逻辑

### Phase 2: 前端适配（向后兼容）

1. **添加类型定义**
   - 在 `packages/web/src/stores/chat-types.ts` 中添加 `extra.errorFallback` 类型定义
   - 从 `packages/shared` 导入 `ErrorFallbackMetadata`

2. **保留 error 处理作为降级**
   - 在 `useAgentMessages.ts` 中保留 error 事件处理，添加日志警告
   - 在 `useSocket-background.ts` 中保留 error 事件处理，添加日志警告
   - 修改 debug event action 为 `error_fallback_frontend_degradation`

3. **验证降级路径**
   - 测试后端未部署时，前端仍能正常处理 error 事件

### Phase 3: 测试与验证

1. **单元测试**
   - 测试流式阶段错误转换逻辑
   - 测试 `classifyError()` 各种错误类型
   - 测试 `getFriendlyAgentErrorMessage()` 输出

2. **集成测试**
   - 使用 mock AgentService 注入各种错误场景
   - 验证错误消息正确持久化
   - 验证 `extra.errorFallback` 字段正确设置

3. **端到端测试**
   - 触发真实的超时/连接/配置错误
   - 验证流式阶段显示友好消息
   - 刷新页面，验证历史消息一致

### Phase 4: 前端优化（可选，未来迭代）

如果后端稳定运行 1-2 个版本后，可以考虑简化前端：

1. **简化 error 处理**
   - 将 error 处理简化为仅状态清理
   - 移除 toast 通知（因为后端已转换为 text 消息）

2. **添加差异化 UI**
   - 在 `ChatMessage.tsx` 中检测 `extra.errorFallback`
   - 显示错误类型标签、重试按钮等

---

## 验证方案

### 1. 流式阶段验证

**测试场景**：触发超时错误

**预期结果**：
- 前端收到 `type: 'text'` 消息（而非 `type: 'error'`）
- 消息内容为友好文案（例如"这次响应超时了，请稍后重试"）
- 消息带有 `extra.errorFallback` 标记
- 消息显示为正常 assistant 气泡（有头像/配色）

### 2. 持久化验证

**测试场景**：触发错误后刷新页面

**预期结果**：
- 数据库中存储的消息：
  - `userId`: 实际用户 ID（而非 'system'）
  - `catId`: 实际猫 ID（而非 null）
  - `content`: 友好消息（而非 "Error: ..."）
  - `extra.errorFallback`: 包含错误分类和原始错误
- 刷新后前端显示与流式阶段完全一致

### 3. 前端差异化处理验证

**测试场景**：前端检测到 `extra.errorFallback`

**预期结果**：
- 可以显示错误类型标签（例如 [超时]）
- 可以显示重试按钮
- 可以上报埋点
- 可以弹 toast 通知

---

## 风险评估

### 高风险

1. **流式转换逻辑错误**
   - 风险：转换后的消息格式不正确，或影响 `done` 消息处理
   - 缓解：充分的单元测试和集成测试，确保 `continue` 不影响后续消息

2. **持久化重复或遗漏**
   - 风险：错误消息重复持久化，或未被持久化
   - 缓解：使用 `hadErrorTransformed` 标记，确保降级逻辑条件准确

### 中风险

1. **前端状态清理不完整**
   - 风险：如果前端完全删除 error 处理，状态清理逻辑会丢失
   - 缓解：保留前端 error 处理作为降级，确保状态清理逻辑完整

2. **向后兼容性**
   - 风险：后端部署失败回滚，前端无法处理原始 error 事件
   - 缓解：前端保留 error 处理作为降级，分阶段部署

### 低风险

1. **错误分类不准确**
   - 风险：`classifyError()` 无法正确识别某些错误类型
   - 缓解：使用 `unknown` 作为兜底分类，不影响功能

2. **友好消息文案不合适**
   - 风险：用户觉得友好消息不够清晰
   - 缓解：后续迭代优化文案，不影响架构

---

## 关键文件清单

| 文件 | 修改内容 |
|------|---------|
| `packages/shared/src/agent-error-transform.ts` | **新建**：共享错误转换模块（包含分类函数） |
| `packages/shared/src/index.ts` | 导出 `getFriendlyAgentErrorMessage`, `classifyError`, `ErrorFallbackKind` |
| `packages/api/src/domains/cats/services/agents/routing/route-serial.ts` | 行 1020-1037：改用友好消息 + assistant 身份 + errorFallback 标记 |
| `packages/api/src/domains/cats/services/agents/routing/route-parallel.ts` | 行 795-814：同上 |
| `packages/web/src/stores/chat-types.ts` | 在 `ChatMessage.extra` 中添加 `errorFallback` 字段定义 |
| `packages/web/src/hooks/agent-error-fallback.ts` | **改为导入共享模块**（或保留作为降级） |
| `packages/web/src/hooks/useAgentMessages.ts` | 保留错误处理逻辑作为降级，添加 errorFallback 检测 |
| `packages/web/src/hooks/useSocket-background.ts` | 保留错误处理逻辑作为降级，添加 errorFallback 检测 |
| `packages/web/src/components/ChatMessage.tsx` | 添加 errorFallback 标签展示逻辑（可选） |
| `packages/api/test/helpers/mock-agent-service.js` | **新建**：可复用的 mock 工厂 |
| `packages/api/test/invoke-single-cat.test.js` | 使用 mock 工厂替代测试钩子 |

---

## 验证方案

### 端到端验证

1. **触发真实错误**：
   - 停止 DARE CLI 进程
   - 发送消息给 @dare
   - 观察前端显示友好错误消息

2. **刷新页面**：
   - 按 F5 刷新
   - 验证错误消息仍然存在（从数据库加载）

3. **检查数据库**：
   ```bash
   redis-cli
   > KEYS "msg:*"
   > HGETALL "msg:default:<message-id>"
   ```
   验证：
   - `userId` 为实际用户 ID（不是 "system"）
   - `catId` 为 cat ID（不是 null）
   - `content` 为友好消息（不是 "Error: ..."）
   - `extra` 包含 `errorFallback` 字段（JSON 格式）

### 单元测试验证

```javascript
it('persists friendly error message as assistant message with errorFallback metadata', async () => {
  const messageStore = createMockMessageStore();
  const errorService = createMockAgentService('codex', {
    errorMessage: 'CLI 响应超时 (1800s)',
  });

  await collect(
    invokeSingleCat(
      { ...makeDeps(), messageStore },
      {
        catId: 'codex',
        service: errorService,
        prompt: 'test',
        userId: 'user1',
        threadId: 'thread-timeout',
        isLastCat: true,
      }
    )
  );

  const appendCalls = messageStore.append.mock.calls;
  const errorMsg = appendCalls.find(call =>
    call[0].content.includes('响应超时')
  );

  assert.ok(errorMsg, 'Should persist friendly error message');
  assert.equal(errorMsg[0].userId, 'user1', 'Should use userId, not "system"');
  assert.equal(errorMsg[0].catId, 'codex', 'Should use catId, not null');
  assert.ok(
    errorMsg[0].content.includes('这次响应超时了'),
    'Should contain friendly message'
  );
  assert.ok(errorMsg[0].extra?.errorFallback, 'Should have errorFallback metadata');
  assert.equal(errorMsg[0].extra.errorFallback.kind, 'timeout', 'Should classify as timeout');
  assert.ok(errorMsg[0].extra.errorFallback.rawError, 'Should preserve raw error');
});
```

---

## 迁移路径

### 阶段 1：共享模块（无破坏性）

1. 创建 `packages/shared/src/agent-error-transform.ts`
2. 从前端 `agent-error-fallback.ts` 移植逻辑
3. 前端改为导入共享模块（保持行为不变）

### 阶段 2：后端拦截（核心修复）

1. 修改 `route-serial.ts` 行 1020-1037
2. 修改 `route-parallel.ts` 行 795-814
3. 部署后验证错误消息落库

### 阶段 3：测试钩子移除（清理）

1. 创建 `mock-agent-service.js` 工厂
2. 重写测试用例，移除 `__TEST_*__` 标记
3. 从 `invoke-single-cat.ts` 删除 `testHook` 逻辑

### 阶段 4：前端简化（可选优化）

1. 简化前端错误拦截逻辑
2. 保留降级路径（兼容旧版后端）

---

## 风险与注意事项

### 风险 1：消息类型变更

**影响**：错误消息从 `userId: 'system', catId: null` 变为 `userId: <actual-user>, catId: <cat-id>`，可能影响：
- 前端消息渲染逻辑（是否区分 system 消息）
- 消息查询逻辑（是否过滤 system 消息）
- 历史消息的展示一致性

**缓解**：
- 检查前端是否有 `msg.userId === 'system'` 的判断（已验证：无此判断）
- 通过 `extra.errorFallback` 标记来区分正常回复和兜底回复
- 前端保留对旧格式 system 错误消息的兼容处理

### 风险 2：历史消息兼容性

**影响**：旧的 system 错误消息仍在数据库中，格式为 `Error: <raw-error>`。

**缓解**：
- 前端保留对 `userId: 'system'` 的兼容处理
- 或运行一次性迁移脚本，将旧错误消息转换为新格式

### 风险 3：并发修改

**影响**：`route-serial.ts` 和 `route-parallel.ts` 是高频修改文件，可能产生合并冲突。

**缓解**：
- 尽早合入主分支
- 或将错误转换逻辑抽取为独立函数，减少修改范围

---

## 总结

### 核心改动

1. **后端流式阶段转换**：在 `route-serial.ts` 和 `route-parallel.ts` 的流式循环中拦截 `error` 事件，转换为 `text` 消息并 yield，使用 `continue` 跳过后续逻辑。

2. **错误分类标记**：通过 `extra.errorFallback` 字段标记错误类型（timeout/connection/config 等），让前端能够区分正常回复和兜底回复。

3. **共享转换逻辑**：将前端的 `agent-error-fallback.ts` 移植为 `packages/shared/src/agent-error-transform.ts`，供前后端复用，统一在共享模块中处理错误消息截断。

4. **降级逻辑完善**：
   - 后端使用 `hadErrorTransformed` 标记，确保降级逻辑条件准确
   - 前端保留 error 事件处理作为降级，确保向后兼容和状态清理完整

5. **测试钩子移除**：通过依赖注入 mock `AgentService`，而非在生产代码中检查特殊字符串。

### 预期效果

- ✅ 错误消息自动落库，刷新后不丢失
- ✅ 流式阶段和历史回放显示一致
- ✅ 前端可通过 `extra.errorFallback` 区分正常回复和兜底回复
- ✅ 支持差异化 UI（错误标签、重试按钮、埋点上报）
- ✅ 测试代码与生产代码完全分离
- ✅ 错误转换逻辑统一维护，前后端一致
- ✅ 向后兼容，前端保留降级路径
