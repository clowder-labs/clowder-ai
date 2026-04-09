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

interface ApprovalCenterPanelProps {
  threadId: string;
}

export function ApprovalCenterPanel({ threadId }: ApprovalCenterPanelProps) {
  const { pending, respond, cancel, cancelAll, fetchPending } = useApprovalCenter(threadId);
  const [policies, setPolicies] = useState<ToolPolicy[]>([]);

  const loadPolicies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/approval/policies');
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
      }
    } catch {
      // Best-effort
    }
  }, []);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  // Re-fetch pending on mount
  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="text-xl">🛡</span>
        <h2 className="text-lg font-semibold text-gray-800">审查中心</h2>
      </div>

      {/* Section 1: Pending approvals */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-600">待审批 ({pending.length})</h3>
          {pending.length > 0 && (
            <button
              onClick={() => void cancelAll()}
              className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            >
              全部取消
            </button>
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

      {/* Section 3: History placeholder */}
      <section>
        <h3 className="text-sm font-medium text-gray-600 mb-2">审批记录</h3>
        <p className="text-xs text-gray-400">暂无记录</p>
      </section>
    </div>
  );
}
