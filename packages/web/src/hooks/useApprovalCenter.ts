'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';

export interface ApprovalPendingRequest {
  requestId: string;
  catId: string;
  threadId: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  riskLevel: 'safe' | 'elevated' | 'dangerous' | 'critical';
  reason: string;
  context?: string;
  createdAt: number;
}

export type ApprovalDecision = 'approve' | 'deny';
export type ApprovalScope = 'once' | 'thread' | 'global';

const AUTO_APPROVE_KEY = 'cat-cafe:approval:auto-approve';

function readAutoApprove(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(AUTO_APPROVE_KEY) === '1';
}

/* -- Desktop notification + tab title flash -- */
function notifyApprovalRequest(data: ApprovalPendingRequest, catLabel: string) {
  const riskLabels: Record<string, string> = {
    safe: '安全',
    elevated: '提升',
    dangerous: '危险',
    critical: '严重',
  };
  const riskText = riskLabels[data.riskLevel] ?? data.riskLevel;

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const n = new Notification(`🛡 工具审批 [${riskText}]`, {
      body: `${catLabel} 请求使用: ${data.toolName}\n${data.reason}`,
      tag: `approval-${data.requestId}`,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }

  if (typeof document !== 'undefined' && document.hidden) {
    const original = document.title;
    let flash = true;
    const iv = setInterval(() => {
      document.title = flash ? `🛡 ${catLabel} 等你审批!` : original;
      flash = !flash;
    }, 1000);
    const stop = () => {
      clearInterval(iv);
      document.title = original;
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) stop(); }, { once: true });
  }
}

export function useApprovalCenter(threadId: string) {
  const [pending, setPending] = useState<ApprovalPendingRequest[]>([]);
  const [autoApprove, setAutoApproveState] = useState<boolean>(() => readAutoApprove());
  const autoApproveRef = useRef(autoApprove);
  const { getCatById } = useCatData();
  const permissionRequested = useRef(false);

  // Keep ref in sync so WebSocket handlers see the latest value
  useEffect(() => {
    autoApproveRef.current = autoApprove;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTO_APPROVE_KEY, autoApprove ? '1' : '0');
    }
  }, [autoApprove]);

  const setAutoApprove = useCallback((next: boolean) => setAutoApproveState(next), []);

  useEffect(() => {
    if (permissionRequested.current) return;
    permissionRequested.current = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const fetchPending = useCallback(async () => {
    try {
      // 不按 threadId 过滤 — 审查中心显示所有待审批
      const res = await apiFetch('/api/approval/requests?status=pending');
      if (res.ok) {
        const data = await res.json();
        const raw: Record<string, unknown>[] = data.pending ?? data.requests ?? [];
        // API 返回 id，但前端接口用 requestId — 标准化
        const normalized = raw.map((r) => ({
          ...r,
          requestId: (r.requestId as string) ?? (r.id as string),
        })) as unknown as ApprovalPendingRequest[];
        setPending(normalized);
      }
    } catch {
      // Best-effort
    }
  }, []);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const respond = useCallback(
    async (requestId: string, decision: ApprovalDecision, scope: ApprovalScope, reason?: string) => {
      try {
        const res = await apiFetch('/api/approval/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, decision, scope, ...(reason ? { reason } : {}) }),
        });
        if (res.ok) {
          setPending((prev) => prev.filter((r) => r.requestId !== requestId));
        }
      } catch {
        // Best-effort
      }
    },
    [],
  );

  const notifiedRef = useRef<Set<string>>(new Set());

  const handleApprovalRequest = useCallback(
    (data: Omit<ApprovalPendingRequest, 'riskLevel'> & { riskLevel: string }) => {
      const normalized: ApprovalPendingRequest = {
        ...data,
        riskLevel: (['safe', 'elevated', 'dangerous', 'critical'].includes(data.riskLevel)
          ? data.riskLevel
          : 'safe') as ApprovalPendingRequest['riskLevel'],
      };
      setPending((prev) => {
        if (prev.some((r) => r.requestId === normalized.requestId)) return prev;
        return [...prev, normalized];
      });
      // Auto-approve: immediately approve new incoming requests when toggle is on
      if (autoApproveRef.current) {
        void respond(normalized.requestId, 'approve', 'once', 'auto-approved');
        return;
      }
      if (!notifiedRef.current.has(normalized.requestId)) {
        notifiedRef.current.add(normalized.requestId);
        const label = getCatById(normalized.catId)?.displayName ?? normalized.catId;
        notifyApprovalRequest(normalized, label);
      }
    },
    [getCatById, respond],
  );

  const handleApprovalResponse = useCallback((data: { requestId: string }) => {
    setPending((prev) => prev.filter((r) => r.requestId !== data.requestId));
  }, []);

  const cancel = useCallback(
    async (requestId: string) => {
      try {
        const res = await apiFetch(`/api/approval/requests/${requestId}/cancel`, { method: 'PATCH' });
        if (res.ok) {
          setPending((prev) => prev.filter((r) => r.requestId !== requestId));
        }
      } catch {
        // Best-effort
      }
    },
    [],
  );

  const cancelAll = useCallback(async () => {
    const ids = pending.map((r) => r.requestId);
    await Promise.allSettled(ids.map((id) => cancel(id)));
  }, [pending, cancel]);

  const approveAll = useCallback(async () => {
    const ids = pending.map((r) => r.requestId);
    await Promise.allSettled(ids.map((id) => respond(id, 'approve', 'once', 'bulk-approved')));
  }, [pending, respond]);

  // When auto-approve is enabled, also approve any current pending immediately
  useEffect(() => {
    if (!autoApprove || pending.length === 0) return;
    void approveAll();
  }, [autoApprove, pending.length, approveAll]);

  return {
    pending,
    respond,
    cancel,
    cancelAll,
    approveAll,
    autoApprove,
    setAutoApprove,
    handleApprovalRequest,
    handleApprovalResponse,
    fetchPending,
  };
}
