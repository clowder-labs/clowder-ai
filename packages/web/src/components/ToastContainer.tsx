/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { type ToastItem, useToastStore } from '@/stores/toastStore';
import { useChatStore } from '@/stores/chatStore';

const DISMISS_DELAY = 300; // animation duration

function ToastCard({ toast }: { toast: ToastItem }) {
  const { removeToast, markExiting } = useToastStore();
  const router = useRouter();
  const threads = useChatStore((s) => s.threads);
  const setCurrentProject = useChatStore((s) => s.setCurrentProject);
  const statusIconSrc =
    toast.type === 'success'
      ? '/icons/message-success.svg'
      : toast.type === 'error'
        ? '/icons/message-error.svg'
        : null;

  const dismiss = useCallback(() => {
    markExiting(toast.id);
    setTimeout(() => removeToast(toast.id), DISMISS_DELAY);
  }, [toast.id, markExiting, removeToast]);

  const handleViewThread = useCallback(() => {
    if (toast.threadId) {
      const target = threads?.find((t) => t.id === toast.threadId);
      setCurrentProject(target?.projectPath ?? 'default');
      router.push(toast.threadId === 'default' ? '/' : `/thread/${toast.threadId}`, { scroll: false });
    }
    dismiss();
  }, [toast.threadId, threads, setCurrentProject, router, dismiss]);

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, dismiss]);

  const toneClass =
    toast.type === 'error'
      ? 'bg-[var(--state-error-surface)] border-[var(--state-error-surface)]'
      : toast.type === 'success'
        ? 'bg-[var(--state-success-surface)] border-[var(--state-success-surface)]'
        : 'bg-[var(--state-warning-surface)] border-[var(--state-warning-surface)]';

  return (
    <div
      className={`
        ${toneClass} box-border text-black rounded-[8px] border
        shadow-[-2px_0px_12px_0px_rgba(0,0,0,0.16)]
        px-4 py-2 max-w-lg pointer-events-auto
        ${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}
      `}
      role="alert"
    >
      <div className="flex flex-row items-start justify-start gap-2">
        {statusIconSrc ? (
          <img
            src={statusIconSrc}
            alt=""
            aria-hidden="true"
            data-testid="toast-status-icon"
            className="mt-0.5 h-4 w-4 flex-shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {toast.threadTitle ? (
            <p className="text-xs text-black/60 truncate mb-0.5" data-testid="toast-thread-title">
              {toast.threadTitle}
            </p>
          ) : null}
          <p className="truncate text-sm font-medium text-black">{toast.title}</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-black/80">{toast.message}</p>
          {toast.threadId ? (
            <button
              onClick={handleViewThread}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
              data-testid="toast-view-button"
            >
              查看
            </button>
          ) : null}
        </div>
        <button
          onClick={dismiss}
          className="text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
