/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useState } from 'react';
import type { AuthPendingRequest, RespondScope } from '@/hooks/useAuthorization';

interface AuthorizationCardProps {
  request: AuthPendingRequest;
  onRespond: (requestId: string, granted: boolean, scope: RespondScope, reason?: string) => void | Promise<void>;
  onOpenSecurityManagement?: () => void;
}

type ActionKey = 'allow-once' | 'allow-always' | 'deny';

interface ActionConfig {
  key: ActionKey;
  label: string;
  granted: boolean;
  scope: RespondScope;
  className: string;
  testId: string;
}

const CARD_ACTIONS: ActionConfig[] = [
  {
    key: 'allow-once',
    label: '本次允许',
    granted: true,
    scope: 'once',
    testId: 'authorization-card-allow-once',
    className: '',
  },
  {
    key: 'allow-always',
    label: '总是允许',
    granted: true,
    scope: 'global',
    testId: 'authorization-card-allow-always',
    className: '',
  },
  {
    key: 'deny',
    label: '拒绝',
    granted: false,
    scope: 'once',
    testId: 'authorization-card-deny',
    className: 'ui-button-danger-outline',
  },
];

function parseAuthorizationCopy(reason: string): { title: string | null; body: string } {
  const normalized = reason.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { title: null, body: reason };

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { title: null, body: reason };

  const [title, ...rest] = lines;
  return {
    title: title || null,
    body: rest.join('\n'),
  };
}

interface ParsedAuthorizationDescription {
  beforeText: string;
  afterText: string;
  paramsRaw: string | null;
  paramsParsed: Record<string, unknown> | null;
}

function isParamsHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return /^(参数|params?)[:：]?$/iu.test(trimmed);
}

function looksLikeJsonFence(line: string): boolean {
  return /^json$/iu.test(line.trim());
}

function countBracketDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === '{' || char === '[') delta += 1;
    if (char === '}' || char === ']') delta -= 1;
  }
  return delta;
}

function safeParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function parseAuthorizationDescription(body: string): ParsedAuthorizationDescription {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const headerIndex = lines.findIndex((line) => isParamsHeader(line));
  if (headerIndex === -1) {
    return { beforeText: normalized.trim(), afterText: '', paramsRaw: null, paramsParsed: null };
  }

  let i = headerIndex + 1;
  while (i < lines.length && (lines[i]?.trim() === '' || looksLikeJsonFence(lines[i] ?? ''))) i += 1;
  if (i >= lines.length) {
    return { beforeText: normalized.trim(), afterText: '', paramsRaw: null, paramsParsed: null };
  }

  const firstTrimmed = (lines[i] ?? '').trim();
  if (!(firstTrimmed.startsWith('{') || firstTrimmed.startsWith('['))) {
    return { beforeText: normalized.trim(), afterText: '', paramsRaw: null, paramsParsed: null };
  }

  const jsonLines: string[] = [];
  let balance = 0;
  let endIndex = i;
  for (; endIndex < lines.length; endIndex += 1) {
    const current = lines[endIndex] ?? '';
    jsonLines.push(current);
    balance += countBracketDelta(current);
    if (jsonLines.length > 0 && balance <= 0) break;
  }

  if (balance > 0) {
    return { beforeText: normalized.trim(), afterText: '', paramsRaw: null, paramsParsed: null };
  }

  const beforeText = lines.slice(0, headerIndex).join('\n').trim();
  const afterText = lines.slice(endIndex + 1).join('\n').trim();
  const paramsRaw = jsonLines.join('\n').trim();
  const paramsParsed = safeParseJsonObject(paramsRaw);
  return { beforeText, afterText, paramsRaw: paramsRaw || null, paramsParsed };
}

function renderParamValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AuthorizationCard({ request, onRespond, onOpenSecurityManagement }: AuthorizationCardProps) {
  const [submittingAction, setSubmittingAction] = useState<ActionKey | null>(null);
  const parsedCopy = useMemo(() => parseAuthorizationCopy(request.reason), [request.reason]);
  const title = parsedCopy.title ?? request.action;
  const description = parsedCopy.title && parsedCopy.body ? parsedCopy.body : request.reason;
  const parsedDescription = useMemo(() => parseAuthorizationDescription(description), [description]);
  const commandValue = renderParamValue(parsedDescription.paramsParsed?.command);
  const workdirValue = renderParamValue(parsedDescription.paramsParsed?.workdir);

  const activeSubmittingAction = useMemo(
    () => CARD_ACTIONS.find((action) => action.key === submittingAction) ?? null,
    [submittingAction],
  );

  const handleAction = async (action: ActionConfig) => {
    if (submittingAction) return;

    setSubmittingAction(action.key);
    try {
      await Promise.resolve(onRespond(request.requestId, action.granted, action.scope));
      setSubmittingAction(null);
    } catch {
      setSubmittingAction(null);
    }
  };

  return (
    <div
      data-testid="authorization-card"
      className="w-full max-w-[482px] min-h-[140px] rounded-[12px] bg-[var(--surface-card-muted)] px-6 py-5 text-[var(--text-primary)]"
      style={{ 'marginLeft': '56px' }}
    >
      <div className="min-w-0">
        <div data-testid="authorization-card-header" className="flex items-center gap-2">
          <img
            src="/icons/userprofile/security.svg"
            alt=""
            aria-hidden="true"
            className="h-[20px] w-[20px] shrink-0"
          />
          <div
            data-testid="authorization-card-title"
            className="min-w-0 flex-1 text-[14px] font-semibold leading-6 text-[var(--text-primary)]"
          >
            {title}
          </div>
        </div>

        <div
          data-testid="authorization-card-description"
          className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-6 text-[var(--text-secondary)]"
        >
          {parsedDescription.beforeText ? <div>{parsedDescription.beforeText}</div> : null}
          {parsedDescription.paramsRaw ? (
            <div
              data-testid="authorization-card-params"
              className="mt-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-panel)] p-2 text-[var(--text-primary)]"
            >
              {commandValue ? (
                <div data-testid="authorization-card-param-command" className="mb-1">
                  <span className="font-semibold">command:</span>{' '}
                  <code className="whitespace-pre-wrap break-words rounded-[4px] bg-[var(--card-muted-bg)] px-1 py-[1px] font-mono">
                    {commandValue}
                  </code>
                </div>
              ) : null}
              {workdirValue ? (
                <div data-testid="authorization-card-param-workdir">
                  <span className="font-semibold">workdir:</span>{' '}
                  <code className="whitespace-pre-wrap break-words rounded-[4px] bg-[var(--card-muted-bg)] px-1 py-[1px] font-mono">
                    {workdirValue}
                  </code>
                </div>
              ) : null}
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-[11px] leading-5 text-[var(--text-label-secondary)]">
                  Raw JSON
                </summary>
                <pre
                  data-testid="authorization-card-params-raw"
                  className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-[6px] bg-[var(--card-muted-bg)] p-2 font-mono text-[11px] leading-5 text-[var(--text-secondary)]"
                >
                  {parsedDescription.paramsRaw}
                </pre>
              </details>
            </div>
          ) : null}
          {parsedDescription.afterText ? <div className="mt-2">{parsedDescription.afterText}</div> : null}
        </div>
        <p data-testid="authorization-card-helper" className="text-[12px] leading-6 text-[var(--text-secondary)]">
          您可随时在
          <button
            type="button"
            data-testid="authorization-card-security-management"
            onClick={onOpenSecurityManagement}
            className="mx-[1px] inline bg-transparent p-0 text-[12px] leading-6 text-[var(--text-accent)]"
          >
            安全管理
          </button>
          中配置或修改安全策略
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {activeSubmittingAction ? (
          <button
            type="button"
            disabled
            data-testid="authorization-card-submitting-action"
            className="ui-button-default"
          >
            {activeSubmittingAction.label}
          </button>
        ) : (
          CARD_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              data-testid={action.testId}
              onClick={() => void handleAction(action)}
              className={`ui-button-default ${action.className}`}
            >
              {action.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
