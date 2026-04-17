/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';

export type SteerMode = 'immediate' | 'promote';

export function SteerQueuedEntryModal({
  mode,
  onCancel,
  onConfirm,
  onModeChange,
}: {
  mode: SteerMode;
  onCancel: () => void;
  onConfirm: () => void;
  onModeChange: (mode: SteerMode) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-medium)]">
      <div className="mx-4 w-full max-w-[520px] overflow-hidden rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] shadow-[var(--modal-shadow)]">
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-[var(--modal-title-text)]">Steer 这条排队消息</h2>
          <p className="text-sm text-[var(--modal-text-muted)] mt-1">选择你希望如何处理这条 queued 消息：</p>
        </div>

        <div className="px-6 pb-5 space-y-3">
          <button
            type="button"
            data-testid="steer-mode-immediate"
            onClick={() => onModeChange('immediate')}
            className={`w-full rounded-xl border p-4 text-left transition-colors ${
              mode === 'immediate'
                ? 'border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)]'
                : 'border-[var(--modal-muted-border)] bg-[var(--modal-surface)] hover:border-[var(--modal-selected-border)]'
            }`}
          >
            <div className="text-sm font-medium text-[var(--modal-text)]">立即执行（必要时中断目标智能体）</div>
            <div className="text-xs text-[var(--modal-text-muted)] mt-1">
              若目标智能体正在执行，会先 cancel 该智能体当前 invocation；若目标智能体空闲，则直接执行这条排队消息。
            </div>
          </button>

          <button
            type="button"
            data-testid="steer-mode-promote"
            onClick={() => onModeChange('promote')}
            className={`w-full rounded-xl border p-4 text-left transition-colors ${
              mode === 'promote'
                ? 'border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)]'
                : 'border-[var(--modal-muted-border)] bg-[var(--modal-surface)] hover:border-[var(--modal-selected-border)]'
            }`}
          >
            <div className="text-sm font-medium text-[var(--modal-text)]">提到队首（不取消）</div>
            <div className="text-xs text-[var(--modal-text-muted)] mt-1">只调整顺序；当前智能体跑完后优先执行这条消息。</div>
          </button>
        </div>

        <div className="px-6 pb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-[var(--modal-text-muted)] transition-colors hover:text-[var(--modal-text)]"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="steer-confirm"
            onClick={onConfirm}
            className="ui-button-primary rounded-full px-4 py-2 text-sm"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
