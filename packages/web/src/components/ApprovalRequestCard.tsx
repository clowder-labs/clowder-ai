'use client';

import { useState } from 'react';
import type { ApprovalDecision, ApprovalPendingRequest, ApprovalScope } from '@/hooks/useApprovalCenter';

const RISK_BADGE_STYLES: Record<string, string> = {
  safe: 'bg-green-100 text-green-700',
  elevated: 'bg-yellow-100 text-yellow-700',
  dangerous: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const RISK_LABELS: Record<string, string> = {
  safe: '安全',
  elevated: '提升',
  dangerous: '危险',
  critical: '严重',
};

interface ApprovalRequestCardProps {
  request: ApprovalPendingRequest;
  onRespond: (requestId: string, decision: ApprovalDecision, scope: ApprovalScope, reason?: string) => void;
  onCancel?: (requestId: string) => void;
}

export function ApprovalRequestCard({ request, onRespond, onCancel }: ApprovalRequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badgeStyle = RISK_BADGE_STYLES[request.riskLevel] ?? RISK_BADGE_STYLES.safe;
  const riskLabel = RISK_LABELS[request.riskLevel] ?? request.riskLevel;

  const [showArgs, setShowArgs] = useState(false);
  const argsStr = request.toolArgs ? JSON.stringify(request.toolArgs, null, 2) : null;
  const timeStr = new Date(request.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="border border-orange-200 bg-orange-50/80 rounded-lg p-3 mx-2 mb-2 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="text-orange-500 mt-0.5 text-lg">🛡</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5 flex-wrap">
            <span>工具审批:</span>
            <code className="text-xs bg-orange-100 px-1 py-0.5 rounded">{request.toolName}</code>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badgeStyle}`}>{riskLabel}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
            <span>发起: {request.catId}</span>
            <span>·</span>
            <span>对话: {request.threadId.slice(0, 12)}...</span>
            <span>·</span>
            <span>{timeStr}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{request.reason}</p>
          {argsStr && (
            <button onClick={() => setShowArgs(!showArgs)} className="text-[11px] text-blue-500 hover:underline mt-1">
              {showArgs ? '收起参数' : '查看参数'}
            </button>
          )}
          {showArgs && argsStr && (
            <pre className="text-[10px] bg-gray-100 rounded p-2 mt-1 overflow-x-auto max-h-32 overflow-y-auto">{argsStr}</pre>
          )}
          {request.context && <p className="text-xs text-gray-500 mt-1 italic">{request.context}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 ml-7">
        {!expanded ? (
          <>
            <button
              onClick={() => onRespond(request.requestId, 'approve', 'once')}
              className="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              批准 (仅此次)
            </button>
            <button
              onClick={() => setExpanded(true)}
              className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              更多选项...
            </button>
            <button
              onClick={() => onRespond(request.requestId, 'deny', 'once')}
              className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors"
            >
              拒绝
            </button>
            {onCancel && (
              <button
                onClick={() => onCancel(request.requestId)}
                className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                取消
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onRespond(request.requestId, 'approve', 'once')}
              className="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              批准 (仅此次)
            </button>
            <button
              onClick={() => onRespond(request.requestId, 'approve', 'thread')}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              批准 (此对话)
            </button>
            <button
              onClick={() => onRespond(request.requestId, 'approve', 'global')}
              className="px-3 py-1 text-xs bg-green-700 text-white rounded-md hover:bg-green-800 transition-colors"
            >
              批准 (全局)
            </button>
            <button
              onClick={() => onRespond(request.requestId, 'deny', 'once')}
              className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors"
            >
              拒绝 (仅此次)
            </button>
            <button
              onClick={() => onRespond(request.requestId, 'deny', 'global')}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              拒绝 (全局)
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              收起
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
