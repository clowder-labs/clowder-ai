/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type Thread, useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { BootcampIcon } from './icons/BootcampIcon';

/** Phase labels for human-readable display */
const PHASE_LABELS: Record<string, string> = {
  'phase-0-select-cat': '选智能体',
  'phase-1-intro': '天团登场',
  'phase-2-env-check': '环境检测',
  'phase-3-config-help': '配置帮助',
  'phase-3.5-advanced': '进阶功能',
  'phase-4-task-select': '选任务',
  'phase-5-kickoff': '立项',
  'phase-6-design': '设计',
  'phase-7-dev': '开发',
  'phase-8-review': 'Review',
  'phase-9-complete': '完成',
  'phase-10-retro': '回顾',
  'phase-11-farewell': '毕业',
};

const PHASE_ORDER = [
  'phase-0-select-cat',
  'phase-1-intro',
  'phase-2-env-check',
  'phase-3-config-help',
  'phase-3.5-advanced',
  'phase-4-task-select',
  'phase-5-kickoff',
  'phase-6-design',
  'phase-7-dev',
  'phase-8-review',
  'phase-9-complete',
  'phase-10-retro',
  'phase-11-farewell',
];

function phaseProgress(phase: string | undefined): number {
  if (!phase) return 0;
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / PHASE_ORDER.length) * 100);
}

interface BootcampListModalProps {
  open: boolean;
  onClose: () => void;
  /** Current thread ID — to skip showing "already here" */
  currentThreadId?: string;
}

export function BootcampListModal({ open, onClose, currentThreadId }: BootcampListModalProps) {
  const router = useRouter();
  const storeThreads = useChatStore((s) => s.threads);
  const setThreads = useChatStore((s) => s.setThreads);
  const [isCreating, setIsCreating] = useState(false);

  // F106 P1 fix: fetch bootcamp threads from API directly, not from sidebar-dependent store
  interface BootcampThreadSummary {
    id: string;
    title?: string;
    phase?: string;
    completedAt?: number;
    startedAt?: number;
    selectedTaskId?: string;
  }
  const [apiThreads, setApiThreads] = useState<BootcampThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBootcampThreads = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/bootcamp/threads');
      if (!res.ok) return;
      const data = await res.json();
      setApiThreads(data.threads ?? []);
    } catch {
      // fall through
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchBootcampThreads();
  }, [open, fetchBootcampThreads]);

  if (!open) return null;

  const handleNavigate = (threadId: string) => {
    router.push(`/thread/${threadId}`);
    onClose();
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const res = await apiFetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🎓训练营',
          bootcampState: { v: 1, phase: 'phase-0-select-cat', startedAt: Date.now() },
        }),
      });
      if (!res.ok) return;
      const thread: Thread = await res.json();
      setThreads([thread, ...storeThreads]);
      router.push(`/thread/${thread.id}`);
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)]" data-testid="bootcamp-list-modal">
      <div className="flex w-[480px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] shadow-[var(--modal-shadow)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--modal-divider)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <BootcampIcon className="w-6 h-6 text-[var(--state-warning-text)]" />
            <span className="text-lg font-semibold text-[var(--modal-title-text)]">我的训练营</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--modal-close-icon)] transition-colors hover:bg-[var(--modal-close-hover-bg)] hover:text-[var(--modal-close-icon-hover)]"
            data-testid="bootcamp-list-close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--modal-empty-text)]">加载中...</p>
          ) : apiThreads.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--modal-empty-text)]">还没有训练营，点下面开始一个吧！</p>
          ) : (
            apiThreads.map((t) => {
              const isCompleted = !!t.completedAt;
              const isCurrent = t.id === currentThreadId;
              const progress = phaseProgress(t.phase);
              const phaseLabel = PHASE_LABELS[t.phase ?? ''] ?? t.phase ?? '?';
              const phaseIdx = PHASE_ORDER.indexOf(t.phase ?? '');
              const phaseNum = phaseIdx >= 0 ? phaseIdx + 1 : '?';

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleNavigate(t.id)}
                  disabled={isCurrent}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    isCurrent
                      ? 'cursor-default border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)] opacity-60'
                      : isCompleted
                        ? 'border-[var(--modal-muted-border)] bg-[var(--modal-muted-surface)] hover:bg-[var(--modal-muted-surface-hover)]'
                        : 'border-[var(--modal-selected-border)] bg-[var(--state-warning-surface)] hover:bg-[var(--modal-selected-surface)]'
                  }`}
                  data-testid={`bootcamp-item-${t.id}`}
                >
                  {/* Top row: title + badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[15px] font-semibold ${isCompleted ? 'text-[var(--modal-text-muted)]' : 'text-[var(--modal-text)]'}`}>
                      {t.title ?? '🎓 训练营'}
                    </span>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        isCompleted
                          ? 'bg-[var(--state-success-surface)] text-[var(--state-success-text)]'
                          : isCurrent
                            ? 'bg-[var(--state-warning-surface)] text-[var(--state-warning-text)]'
                            : 'bg-[var(--state-warning-surface)] text-[var(--state-warning-text)]'
                      }`}
                    >
                      {isCurrent ? '当前' : isCompleted ? '已完成 ✓' : '进行中'}
                    </span>
                  </div>
                  {/* Meta: task + phase */}
                  <div className="mb-2 flex items-center justify-between text-[13px] text-[var(--modal-text-muted)]">
                    <div className="flex items-center gap-4">
                      {t.selectedTaskId && <span>⭐ {t.selectedTaskId}</span>}
                      <span>
                        Phase {phaseNum}/{PHASE_ORDER.length} · {phaseLabel}
                      </span>
                    </div>
                    {!isCurrent && (
                      <svg className="h-4 w-4 text-[var(--modal-text-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-[var(--modal-progress-track)]">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isCompleted ? 'bg-[var(--modal-progress-success)]' : 'bg-[var(--modal-progress-warning)]'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer: create new */}
        <div className="flex justify-center border-t border-[var(--modal-divider)] px-6 py-4">
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="ui-button-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold disabled:opacity-40"
            data-testid="bootcamp-list-create"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {isCreating ? '创建中...' : '开始新训练营'}
          </button>
        </div>
      </div>
    </div>
  );
}
