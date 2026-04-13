/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CatId, RespondScope } from '@cat-cafe/shared';
import type { AuthorizationManager } from './AuthorizationManager.js';

interface JiuwenQuestionOption {
  label: string;
  description?: string;
}

interface JiuwenQuestion {
  header?: string;
  question: string;
  options: JiuwenQuestionOption[];
  multi_select?: boolean;
}

export interface JiuwenAskUserQuestionPayload {
  request_id: string;
  session_id?: string;
  questions: JiuwenQuestion[];
}

export interface JiuwenUserAnswer {
  selected_options: string[];
  custom_input?: string;
}

export interface JiuwenBridgeAnswerSubmission {
  sessionId: string;
  jiuwenRequestId: string;
  answers: JiuwenUserAnswer[];
}

export interface JiuwenPermissionBridgeRecord {
  localRequestId: string;
  jiuwenRequestId: string;
  sessionId: string;
  threadId: string;
  catId: CatId;
  invocationId: string;
  createdAt: number;
}

interface IngestPermissionRequestInput {
  catId: CatId;
  threadId: string;
  invocationId: string;
  sessionId: string;
  payload: JiuwenAskUserQuestionPayload;
  submitAnswer: (submission: JiuwenBridgeAnswerSubmission) => Promise<void>;
}

interface BridgeRecordState extends JiuwenPermissionBridgeRecord {
  submitAnswer: (submission: JiuwenBridgeAnswerSubmission) => Promise<void>;
  status: 'waiting' | 'resolved';
}

const PERMISSION_HEADER_KEYWORDS = ['权限审批', '权限', 'authorization', 'approval'];
const ALLOW_ONCE_LABEL = '本次允许';
const ALLOW_ALWAYS_LABEL = '总是允许';
const DENY_LABEL = '拒绝';

function normalizeText(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function extractAction(questionText: string): string {
  const codeMatch = questionText.match(/工具\s*`([^`]+)`/u);
  if (codeMatch?.[1]) return codeMatch[1];
  const quotedMatch = questionText.match(/工具\s*"([^"]+)"/u);
  if (quotedMatch?.[1]) return quotedMatch[1];
  return '工具调用授权';
}

function stripMarkdown(questionText: string): string {
  return questionText
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function extractReason(questionText: string): string {
  const text = stripMarkdown(questionText);
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.join('\n');
}

export class JiuwenPermissionBridge {
  private authManager: AuthorizationManager | null = null;
  private readonly byLocalRequestId = new Map<string, BridgeRecordState>();

  bindAuthorizationManager(authManager: AuthorizationManager): void {
    this.authManager = authManager;
  }

  isPermissionApprovalPayload(payload: JiuwenAskUserQuestionPayload): boolean {
    if (!payload || !Array.isArray(payload.questions) || payload.questions.length !== 1) return false;
    const [question] = payload.questions;
    if (!question || !Array.isArray(question.options)) return false;

    const labels = new Set(question.options.map((option) => option.label));
    const hasExpectedOptions =
      labels.has(ALLOW_ONCE_LABEL) && labels.has(ALLOW_ALWAYS_LABEL) && labels.has(DENY_LABEL);
    if (!hasExpectedOptions) return false;

    const header = normalizeText(question.header);
    if (PERMISSION_HEADER_KEYWORDS.some((keyword) => header.includes(normalizeText(keyword)))) return true;

    const body = normalizeText(question.question);
    return body.includes('需要授权') || body.includes('permission');
  }

  async ingestAskUserQuestion(input: IngestPermissionRequestInput): Promise<JiuwenPermissionBridgeRecord | null> {
    if (!this.authManager) return null;
    if (!this.isPermissionApprovalPayload(input.payload)) return null;

    const [question] = input.payload.questions;
    const record = await this.authManager.createPendingFromExternalSource({
      invocationId: input.invocationId,
      catId: input.catId,
      threadId: input.threadId,
      action: extractAction(question.question),
      reason: extractReason(question.question),
      context: JSON.stringify(input.payload),
    });

    const created: BridgeRecordState = {
      localRequestId: record.requestId,
      jiuwenRequestId: input.payload.request_id,
      sessionId: input.sessionId,
      threadId: input.threadId,
      catId: input.catId,
      invocationId: input.invocationId,
      createdAt: record.createdAt,
      submitAnswer: input.submitAnswer,
      status: 'waiting',
    };
    this.byLocalRequestId.set(created.localRequestId, created);

    return {
      localRequestId: created.localRequestId,
      jiuwenRequestId: created.jiuwenRequestId,
      sessionId: created.sessionId,
      threadId: created.threadId,
      catId: created.catId,
      invocationId: created.invocationId,
      createdAt: created.createdAt,
    };
  }

  async submitAuthorizationDecision(input: {
    localRequestId: string;
    granted: boolean;
    scope: RespondScope;
    reason?: string;
  }): Promise<boolean> {
    const record = this.byLocalRequestId.get(input.localRequestId);
    if (!record || record.status !== 'waiting') return false;

    const selectedOption = input.granted
      ? input.scope === 'global'
        ? ALLOW_ALWAYS_LABEL
        : ALLOW_ONCE_LABEL
      : DENY_LABEL;

    record.status = 'resolved';
    await record.submitAnswer({
      sessionId: record.sessionId,
      jiuwenRequestId: record.jiuwenRequestId,
      answers: [{ selected_options: [selectedOption], ...(input.reason ? { custom_input: input.reason } : {}) }],
    });
    return true;
  }
}

const singleton = new JiuwenPermissionBridge();

export function getJiuwenPermissionBridge(): JiuwenPermissionBridge {
  return singleton;
}
