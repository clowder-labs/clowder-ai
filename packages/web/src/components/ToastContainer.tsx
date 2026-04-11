/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect } from 'react';
import { type ToastItem, useToastStore } from '@/stores/toastStore';

const DISMISS_DELAY = 300; // animation duration

function ToastCard({ toast }: { toast: ToastItem }) {
  const { removeToast, markExiting } = useToastStore();
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
          <p className="truncate text-sm font-medium text-black">{toast.title}</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-black/80">{toast.message}</p>
        </div>
        <button
          onClick={dismiss}
          className="text-gray-300 hover:text-gray-500 flex-shrink-0 p-0.5"
          title="关闭"
          aria-label="关闭"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.293 4.293a1 1 0 011.414 0L7 5.586l1.293-1.293a1 1 0 111.414 1.414L8.414 7l1.293 1.293a1 1 0 01-1.414 1.414L7 8.414 5.707 9.707a1 1 0 01-1.414-1.414L5.586 7 4.293 5.707a1 1 0 010-1.414z" />
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
