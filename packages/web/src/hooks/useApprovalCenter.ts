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
  const { getCatById } = useCatData();
  const permissionRequested = useRef(false);

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
      if (!notifiedRef.current.has(normalized.requestId)) {
        notifiedRef.current.add(normalized.requestId);
        const label = getCatById(normalized.catId)?.displayName ?? normalized.catId;
        notifyApprovalRequest(normalized, label);
      }
    },
    [getCatById],
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

  return { pending, respond, cancel, cancelAll, handleApprovalRequest, handleApprovalResponse, fetchPending };
}
