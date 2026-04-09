'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApprovalCenter } from '@/hooks/useApprovalCenter';
import { apiFetch } from '@/utils/api-client';
import { ApprovalRequestCard } from './ApprovalRequestCard';

interface ToolPolicy {
  id: string;
  toolPattern: string;
  riskLevel: string;
  requiresApproval: boolean;
  enabled: boolean;
}

interface AuditEntry {
  id: string;
  catId: string;
  threadId: string;
  toolName: string;
  riskLevel: string;
  status: string;
  decisions: { decidedBy: string; decision: string; scope: string; decidedAt: number }[];
  createdAt: number;
  updatedAt: number;
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-500',
  expired: 'bg-yellow-100 text-yellow-700',
};
const STATUS_LABELS: Record<string, string> = {
  approved: '已批准', denied: '已拒绝', canceled: '已取消', expired: '已过期',
};

interface ApprovalCenterPanelProps {
  threadId: string;
}

export function ApprovalCenterPanel({ threadId }: ApprovalCenterPanelProps) {
  const { pending, respond, cancel, cancelAll, approveAll, autoApprove, setAutoApprove, fetchPending } = useApprovalCenter(threadId);
  const [policies, setPolicies] = useState<ToolPolicy[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);

  const loadPolicies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/approval/policies');
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
      }
    } catch { /* best-effort */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/api/approval/audit?limit=50');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.entries ?? []);
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    void loadPolicies();
    void loadHistory();
  }, [loadPolicies, loadHistory]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛡</span>
          <h2 className="text-lg font-semibold text-gray-800">审查中心</h2>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-gray-600">自动审批</span>
          <button
            onClick={() => setAutoApprove(!autoApprove)}
            role="switch"
            aria-checked={autoApprove}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoApprove ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                autoApprove ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
          {autoApprove && <span className="text-[10px] text-green-600 font-medium">已开启</span>}
        </label>
      </div>

      {/* Section 1: Pending approvals */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-600">待审批 ({pending.length})</h3>
          {pending.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void approveAll()}
                className="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium"
              >
                一键批准全部
              </button>
              <button
                onClick={() => void cancelAll()}
                className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                全部取消
              </button>
            </div>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-xs text-gray-400">暂无待审批请求</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((req) => (
              <ApprovalRequestCard key={req.requestId} request={req} onRespond={respond} onCancel={cancel} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Tool policies */}
      <section>
        <h3 className="text-sm font-medium text-gray-600 mb-2">策略配置</h3>
        {policies.length === 0 ? (
          <p className="text-xs text-gray-400">暂无策略配置</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">工具匹配</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">风险等级</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">需要审批</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">状态</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{p.toolPattern}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        p.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                        p.riskLevel === 'dangerous' ? 'bg-orange-100 text-orange-700' :
                        p.riskLevel === 'elevated' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>{p.riskLevel}</span>
                    </td>
                    <td className="px-3 py-2">{p.requiresApproval ? '是' : '否'}</td>
                    <td className="px-3 py-2">{p.enabled ? '启用' : '禁用'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Approval history */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-600">审批记录 ({history.length})</h3>
          {history.length > 0 && (
            <button onClick={() => void loadHistory()} className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
              刷新
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-gray-400">暂无记录</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">工具</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">发起</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">状态</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">审批人</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">时间</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => {
                  const lastDecision = e.decisions[e.decisions.length - 1];
                  const time = new Date(e.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={e.id} className="border-t">
                      <td className="px-3 py-2 font-mono">{e.toolName}</td>
                      <td className="px-3 py-2">{e.catId}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[e.status] ?? e.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{lastDecision?.decidedBy ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-400">{time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
