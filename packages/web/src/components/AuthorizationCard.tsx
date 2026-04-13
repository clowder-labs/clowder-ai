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
    className: 'border-[#595959] bg-white text-[#202020] hover:border-[#434343] hover:bg-[#FAFAFA]',
  },
  {
    key: 'allow-always',
    label: '始终允许',
    granted: true,
    scope: 'global',
    testId: 'authorization-card-allow-always',
    className: 'border-[#595959] bg-white text-[#202020] hover:border-[#434343] hover:bg-[#FAFAFA]',
  },
  {
    key: 'deny',
    label: '拒绝',
    granted: false,
    scope: 'once',
    testId: 'authorization-card-deny',
    className: 'border-[#FF4D4F] bg-white text-[#FF4D4F] hover:border-[#FF7875] hover:bg-[#FFF2F0]',
  },
];

export function AuthorizationCard({ request, onRespond, onOpenSecurityManagement }: AuthorizationCardProps) {
  const [submittingAction, setSubmittingAction] = useState<ActionKey | null>(null);

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
      className="mx-2 mb-2 w-full max-w-[482px] min-h-[140px] rounded-[16px] border border-[#F0F0F0] bg-white px-6 py-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-start gap-2">
        <img
          src="/icons/userprofile/security.svg"
          alt=""
          aria-hidden="true"
          className="mt-[1px] h-[20px] w-[20px] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div
              data-testid="authorization-card-title"
              className="text-[14px] font-semibold leading-6 text-[#202020]"
            >
              {request.action}
            </div>
            {/* <span
              data-testid="authorization-card-risk-badge"
              className="inline-flex h-6 items-center rounded-[4px] bg-[#FFF4E5] px-1.5 text-[12px] leading-5 text-[#D46B08]"
            >
              中风险
            </span> */}
          </div>

          <p
            data-testid="authorization-card-description"
            className="mt-3 text-[12px] leading-6 text-[#595959]"
          >
            {request.reason}
          </p>
          <p data-testid="authorization-card-helper" className="text-[12px] leading-6 text-[#595959]">
            您可以随时在
            <button
              type="button"
              data-testid="authorization-card-security-management"
              onClick={onOpenSecurityManagement}
              className="mx-[1px] inline bg-transparent p-0 text-[12px] leading-6 text-[#1476FF]"
            >
              安全管理
            </button>
            中配置或修改安全策略
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {activeSubmittingAction ? (
          <button
            type="button"
            disabled
            data-testid="authorization-card-submitting-action"
            className="inline-flex h-8 min-w-[82px] items-center justify-center rounded-full border border-[#DBDBDB] bg-[#F0F0F0] px-5 text-[12px] font-normal leading-5 text-[#C2C2C2]"
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
              className={`inline-flex h-8 min-w-[82px] items-center justify-center rounded-full border px-5 text-[12px] font-normal leading-5 transition-colors ${action.className}`}
            >
              {action.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
