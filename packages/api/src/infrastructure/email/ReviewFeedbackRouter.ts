import type { ConnectorSource, GitHubReviewThreadBaseline } from '@cat-cafe/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { GitHubWaitLifecycleService } from '../../domains/github-signals/GitHubWaitLifecycleService.js';
import type { ITaskStore } from '../../domains/cats/services/stores/ports/TaskStore.js';
import { type ConnectorDeliveryDeps, deliverConnectorMessage } from './deliver-connector-message.js';
import { getMaxSeverity } from './severity-parser.js';

export interface PrFeedbackComment {
  readonly id: number;
  readonly reviewId?: number;
  readonly author: string;
  readonly actorType?: string;
  readonly body: string;
  readonly createdAt: string;
  readonly commitId?: string;
  readonly commentType: 'inline' | 'conversation';
  readonly filePath?: string;
  readonly line?: number;
  readonly authorAssociation?: string;
}

export interface PrReviewDecision {
  readonly id: number;
  readonly author: string;
  readonly actorType?: string;
  readonly state: 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED' | 'COMMENTED';
  readonly body: string;
  readonly submittedAt: string;
  readonly commitId?: string;
  readonly authorAssociation?: string;
}

export interface ReviewFeedbackRoutingAudit {
  readonly kind: 'legacy-auto-rotated-repaired';
  readonly previousThreadId: string;
  readonly repairedThreadId: string;
}

export interface ReviewFeedbackSignal {
  readonly repoFullName: string;
  readonly prNumber: number;
  readonly headSha?: string;
  readonly routingAudit?: ReviewFeedbackRoutingAudit;
  readonly newComments: readonly PrFeedbackComment[];
  readonly newDecisions: readonly PrReviewDecision[];
  readonly inlineCommentCursor: number;
  readonly conversationCommentCursor: number;
  readonly decisionCursor: number;
  readonly reviewThreads?: readonly GitHubReviewThreadBaseline[];
  readonly resultTriggerCommentId?: number;
  readonly resultSourceRef?: string;
  readonly resultConversationCommentCursor?: number;
  readonly resultDecision?: string;
  readonly resultReviewer?: string;
  readonly subjectState?: 'merged' | 'closed';
}

export type ReviewFeedbackRouteResult =
  | {
      readonly kind: 'notified';
      readonly threadId: string;
      readonly catId: string;
      readonly messageId: string;
      readonly content: string;
    }
  | { readonly kind: 'skipped'; readonly reason: string };

export interface ReviewFeedbackRouterOptions {
  readonly deliveryDeps: ConnectorDeliveryDeps;
  readonly waitLifecycle: GitHubWaitLifecycleService;
  readonly taskStore: ITaskStore;
  readonly log: FastifyBaseLogger;
}

export class ReviewFeedbackRouter {
  constructor(private readonly opts: ReviewFeedbackRouterOptions) {}

  async route(
    signal: ReviewFeedbackSignal,
    /**
     * Two supported shapes:
     * - `{ taskId }` — upstream shape (F280). Router fetches the PR/issue tracking
     *   task from taskStore to derive owner threadId/catId/userId + F202
     *   trackingInstructions and delivers develop's rich three-section content.
     * - explicit `{ threadId, catId, userId, ... }` — legacy develop-parent
     *   direct-addressing shape retained for callers that pre-resolve identity.
     */
    tracking:
      | { taskId: string; threadId?: never; catId?: never; userId?: never; trackingInstructions?: never; trackingInstructionsHeadSha?: never }
      | {
          taskId?: string;
          threadId: string;
          catId: string;
          userId: string;
          trackingInstructions?: string;
          trackingInstructionsHeadSha?: string;
        },
  ): Promise<ReviewFeedbackRouteResult> {
    if (signal.newComments.length === 0 && signal.newDecisions.length === 0 && !signal.routingAudit) {
      return { kind: 'skipped', reason: 'no new feedback' };
    }

    let threadId: string | undefined = tracking.threadId;
    let catId: string | undefined = tracking.catId;
    let userId: string | undefined = tracking.userId;
    let trackingInstructions: string | undefined = tracking.trackingInstructions;
    let trackingInstructionsHeadSha: string | undefined = tracking.trackingInstructionsHeadSha;

    // Upstream F280 path: resolve owner + F202 instructions from the tracked task.
    if ((!threadId || !catId || !userId) && tracking.taskId) {
      const task = await this.opts.taskStore.get(tracking.taskId);
      if (!task || (task.kind !== 'pr_tracking' && task.kind !== 'issue_tracking')) {
        return { kind: 'skipped', reason: `no PR/issue tracking task for ${tracking.taskId}` };
      }
      threadId = task.threadId;
      catId = task.ownerCatId ?? '';
      userId = task.userId ?? '';
      const state = task.automationState as
        | { trackingInstructions?: string; trackingInstructionsHeadSha?: string }
        | undefined;
      if (trackingInstructions === undefined && state?.trackingInstructions) {
        trackingInstructions = state.trackingInstructions;
      }
      if (trackingInstructionsHeadSha === undefined && state?.trackingInstructionsHeadSha) {
        trackingInstructionsHeadSha = state.trackingInstructionsHeadSha;
      }
    }

    if (!threadId || !catId || !userId) {
      return { kind: 'skipped', reason: 'unable to resolve owner threadId/catId/userId' };
    }

    const content = buildReviewFeedbackContent(signal, trackingInstructions, trackingInstructionsHeadSha);

    const source: ConnectorSource = {
      connector: 'github-review-feedback',
      label: 'Review Feedback',
      icon: 'github',
      url: `https://github.com/${signal.repoFullName}/pull/${signal.prNumber}`,
    };

    const result = await deliverConnectorMessage(this.opts.deliveryDeps, {
      threadId,
      userId,
      catId,
      content,
      source,
    });
    return {
      kind: 'notified',
      threadId,
      catId,
      messageId: result.messageId,
      content: result.content,
    };
  }
}

// ── Message Formatting (OQ-2: three-section aggregation) ───────────

export function buildReviewFeedbackContent(
  signal: ReviewFeedbackSignal,
  trackingInstructions?: string,
  trackingInstructionsHeadSha?: string,
): string {
  const lines: string[] = [];

  // F140 Phase E.1: prepend severity header when comments/decisions contain
  // a recognized P0/P1/P2 marker. Replaces the email-channel "Review 检测到 Px"
  // header so polling can surface severity without dual-channel notifications.
  const maxSev = getMaxSeverity(signal.newComments, signal.newDecisions);
  if (maxSev) {
    lines.push(`**Review 检测到 ${maxSev}**`, '');
  }

  if (signal.routingAudit) {
    lines.push(...formatRoutingAudit(signal.routingAudit), '');
  }

  lines.push(`📋 **Review Feedback** — PR #${signal.prNumber} (${signal.repoFullName})`);

  // Section 1: Review Decisions
  if (signal.newDecisions.length > 0) {
    lines.push('', '--- Review Decisions ---');
    for (const d of signal.newDecisions) {
      const emoji = decisionEmoji(d.state);
      // F202 Phase 2C (AC-C4): wrap external content as untrusted
      const bodySnippet = d.body
        ? ` — [UNTRUSTED EXTERNAL CONTENT] ${d.body.slice(0, 120).replace(/[\r\n]+/g, ' ')}`
        : '';
      lines.push(`${emoji} **${d.author}**: ${d.state}${bodySnippet}`);
    }
  }

  // Section 2: Inline Comments
  const inline = signal.newComments.filter((c) => c.commentType === 'inline');
  if (inline.length > 0) {
    lines.push('', `--- Inline Comments (${inline.length}) ---`);
    for (const c of inline) {
      const location = c.filePath ? `\`${c.filePath}${c.line ? `:${c.line}` : ''}\`` : '';
      // F202 Phase 2C (AC-C4): wrap external content as untrusted — flatten newlines to prevent escape
      const bodySnippet = `[UNTRUSTED EXTERNAL CONTENT] ${c.body.slice(0, 120).replace(/[\r\n]+/g, ' ')}`;
      lines.push(`💬 **${c.author}** ${location}: ${bodySnippet}`);
    }
  }

  // Section 3: PR Conversation
  const conversation = signal.newComments.filter((c) => c.commentType === 'conversation');
  if (conversation.length > 0) {
    lines.push('', `--- PR Conversation (${conversation.length}) ---`);
    for (const c of conversation) {
      // F202 Phase 2C (AC-C4): wrap external content as untrusted — flatten newlines to prevent escape
      const bodySnippet = `[UNTRUSTED EXTERNAL CONTENT] ${c.body.slice(0, 120).replace(/[\r\n]+/g, ' ')}`;
      lines.push(`💬 **${c.author}**: ${bodySnippet}`);
    }
  }

  // Phase B: Action hint for auto-response
  lines.push('', '---', '🔧 **自动处理**', `- 目标: ${signal.repoFullName}#${signal.prNumber}`);

  const hasChangesRequested = signal.newDecisions.some((d) => d.state === 'CHANGES_REQUESTED');
  const hasApproved = signal.newDecisions.some((d) => d.state === 'APPROVED');

  if (hasChangesRequested) {
    lines.push('- 操作: 加载 `receive-review` 模式，逐项处理 review 意见（Red→Green）');
  } else if (hasApproved) {
    lines.push('- 操作: PR 已被批准，检查 CI 和冲突状态，准备 merge');
  } else {
    lines.push('- 操作: 阅读评论内容，需要回复则回复，需要修改则按 `receive-review` 模式处理');
  }

  // F202 Phase 2C (AC-C2): append user-provided tracking instructions
  if (shouldAppendTrackingInstructions(trackingInstructions, signal.headSha, trackingInstructionsHeadSha)) {
    lines.push('', '📌 **Tracking Instructions**', trackingInstructions);
  }

  return lines.join('\n');
}

function shouldAppendTrackingInstructions(
  trackingInstructions: string | undefined,
  currentHeadSha: string | undefined,
  instructionsHeadSha: string | undefined,
): trackingInstructions is string {
  if (!trackingInstructions) return false;
  if (!instructionsHeadSha) return true;
  if (!currentHeadSha) return false;
  return instructionsHeadSha === currentHeadSha;
}

function formatRoutingAudit(audit: ReviewFeedbackRoutingAudit): string[] {
  switch (audit.kind) {
    case 'legacy-auto-rotated-repaired':
      return [
        '⚠️ **PR review feedback 路由异常已修复**',
        `检测到 PR tracking task 指向 auto-rotated thread \`${audit.previousThreadId}\`，已修回注册 thread \`${audit.repairedThreadId}\`。`,
        '后续 review feedback 会继续投回注册 thread。',
      ];
    default: {
      const _exhaustive: never = audit.kind;
      return _exhaustive;
    }
  }
}

function decisionEmoji(state: PrReviewDecision['state']): string {
  switch (state) {
    case 'APPROVED':
      return '✅';
    case 'CHANGES_REQUESTED':
      return '🔄';
    case 'DISMISSED':
      return '🚫';
    case 'COMMENTED':
      return '💬';
  }
}
