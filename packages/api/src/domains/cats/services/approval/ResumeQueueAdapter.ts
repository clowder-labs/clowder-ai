/**
 * Resume Queue Adapter (审批后会话恢复适配器)
 *
 * 将 ApprovalManager 的恢复请求适配到 InvocationQueue + QueueProcessor，
 * 入队后立刻触发 tryAutoExecute 让 QueueProcessor 自动 dispatch。
 */

import type { CatId } from '@cat-cafe/shared';
import type { InvocationQueue } from '../agents/invocation/InvocationQueue.js';
import type { QueueProcessor } from '../agents/invocation/QueueProcessor.js';
import type { IResumeQueue } from './ApprovalManager.js';

export class ResumeQueueAdapter implements IResumeQueue {
  constructor(
    private readonly invocationQueue: InvocationQueue,
    private readonly queueProcessor: QueueProcessor,
  ) {}

  enqueueResume(params: {
    threadId: string;
    userId: string;
    catId: CatId;
    content: string;
    toolName: string;
    toolArgs: Readonly<Record<string, unknown>>;
  }): void {
    const result = this.invocationQueue.enqueue({
      threadId: params.threadId,
      userId: params.userId,
      content: params.content,
      source: 'agent',
      targetCats: [params.catId],
      intent: 'execute',
      autoExecute: true,
      resumeCatId: params.catId,
      approvedToolCall: { toolName: params.toolName, toolArgs: params.toolArgs },
    });

    if (result.outcome !== 'full') {
      // 入队成功 → 立刻触发 QueueProcessor 处理
      void this.queueProcessor.tryAutoExecute(params.threadId);
    }
  }
}
