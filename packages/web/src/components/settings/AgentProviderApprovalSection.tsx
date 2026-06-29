'use client';

/**
 * F241 Phase C — Hub UI for owner approval.
 *
 * Renders an approval section for each `agentProvider` resource of a plugin:
 *  - Shows the current lifecycle state (transportReady / healthy) + routeable
 *    bool + any `health.failureReason` so operators can see why a probe failed.
 *  - For non-routeable rows: renders the approve form (catId input +
 *    mentionPatterns chip input) prefilled from manifest claims (PR #39).
 *  - For already-routeable rows: shows the live binding (catId + patterns)
 *    and a "重新绑定" / "停用路由" pair so the operator can re-approve under
 *    a new binding or take the cat offline without disabling the whole plugin.
 *
 * POSTs `/api/plugins/:id/capabilities/:capId/approve-routeable` with
 *   { catId, mentionPatterns? }. Failure body includes structured
 * `reason` + `details` from the approval service so the form can surface
 * admission collisions / health-probe failures inline.
 */

import type { PluginInfo, PluginResourceStatus } from '@cat-cafe/shared';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

interface Props {
  plugin: PluginInfo;
  onUpdated: () => void;
}

type ApprovalRowState = {
  catId: string;
  mentionPatternsText: string;
  busy: boolean;
  result: { type: 'success' | 'error'; msg: string } | null;
  /** Tracks whether the operator is editing an already-bound row (re-bind flow). */
  rebinding: boolean;
};

/** Comma- or whitespace-separated `@name` list → trimmed string[] (drop empties). */
function parseMentionPatterns(text: string): string[] {
  return text
    .split(/[,\s]+/u)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function joinMentionPatterns(values: string[] | undefined): string {
  return (values ?? []).join(', ');
}

function defaultCatIdFromResource(resource: PluginResourceStatus, pluginId: string): string {
  // Prefer manifest providerId claim → resource name → plugin id (last-resort).
  return resource.agentProviderClaims?.providerId ?? resource.name ?? pluginId;
}

type ApproveResponse =
  | { ok: true; capability?: unknown }
  | { ok: false; reason?: string; details?: string; conflictingIdentity?: string };

/** Build operator-visible error message from a structured approval failure. */
function approvalErrorMessage(data: Extract<ApproveResponse, { ok: false }>): string {
  const head = data.reason ?? '未知错误';
  const tail = data.details ? `: ${data.details}` : '';
  const conflict = data.conflictingIdentity ? ` (冲突身份: ${data.conflictingIdentity})` : '';
  return `${head}${tail}${conflict}`;
}

/** POST approve-routeable + normalize the network/JSON/structured-failure error paths. */
async function postApproveRouteable(
  pluginId: string,
  capId: string,
  catId: string,
  mentionPatterns: string[],
): Promise<{ ok: true } | { ok: false; msg: string }> {
  try {
    const res = await apiFetch(`/api/plugins/${pluginId}/capabilities/${encodeURIComponent(capId)}/approve-routeable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catId,
        ...(mentionPatterns.length > 0 ? { mentionPatterns } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as ApproveResponse;
    if (!res.ok || ('ok' in data && data.ok === false)) {
      const msg = 'ok' in data && data.ok === false ? approvalErrorMessage(data) : `HTTP ${res.status}`;
      return { ok: false, msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : '网络错误' };
  }
}

function StateChip({ resource }: { resource: PluginResourceStatus }) {
  const state = resource.agentProviderState;
  const routeable = resource.agentProviderRouteable;
  if (state === 'healthy' && routeable) {
    return (
      <span className="rounded-[13px] bg-conn-emerald-bg px-2.5 py-0.5 text-label font-medium text-conn-emerald-text">
        ✓ routeable · healthy
      </span>
    );
  }
  if (state === 'transportReady') {
    return (
      <span className="rounded-[13px] bg-cafe-surface-sunken px-2.5 py-0.5 text-label font-medium text-cafe-muted">
        待审批 · transportReady
      </span>
    );
  }
  return (
    <span className="rounded-[13px] bg-cafe-surface-sunken px-2.5 py-0.5 text-label font-medium text-cafe-muted">
      {state ?? '未激活'}
    </span>
  );
}

export function AgentProviderApprovalSection({ plugin, onUpdated }: Props) {
  const agentProviderRows = useMemo(
    () => plugin.resources.filter((r) => r.type === 'agentProvider'),
    [plugin.resources],
  );

  const initialRowState = (resource: PluginResourceStatus): ApprovalRowState => ({
    catId: resource.agentProviderBinding?.catId ?? defaultCatIdFromResource(resource, plugin.id),
    mentionPatternsText: joinMentionPatterns(
      resource.agentProviderBinding?.mentionPatterns ?? resource.agentProviderClaims?.mentionPatterns,
    ),
    busy: false,
    result: null,
    rebinding: false,
  });

  // Key by capId so re-renders after onUpdated() naturally re-mount the form
  // state from the freshest binding rather than holding stale operator input.
  const [rowState, setRowState] = useState<Record<string, ApprovalRowState>>(() => {
    const acc: Record<string, ApprovalRowState> = {};
    for (const r of agentProviderRows) {
      if (r.capId) acc[r.capId] = initialRowState(r);
    }
    return acc;
  });

  if (agentProviderRows.length === 0) return null;

  const getRow = (resource: PluginResourceStatus): ApprovalRowState => {
    if (!resource.capId) return initialRowState(resource);
    return rowState[resource.capId] ?? initialRowState(resource);
  };

  const updateRow = (capId: string, patch: Partial<ApprovalRowState>) => {
    setRowState((prev) => ({
      ...prev,
      [capId]: { ...(prev[capId] ?? ({} as ApprovalRowState)), ...patch },
    }));
  };

  const handleApprove = async (resource: PluginResourceStatus) => {
    const capId = resource.capId;
    if (!capId) return;
    const row = getRow(resource);
    const catId = row.catId.trim();
    if (!catId) {
      updateRow(capId, { result: { type: 'error', msg: '请填写 catId 绑定' } });
      return;
    }
    updateRow(capId, { busy: true, result: null });
    const mentionPatterns = parseMentionPatterns(row.mentionPatternsText);
    const result = await postApproveRouteable(plugin.id, capId, catId, mentionPatterns);
    if (result.ok) {
      updateRow(capId, { busy: false, rebinding: false, result: { type: 'success', msg: '审批已生效' } });
      onUpdated();
    } else {
      updateRow(capId, { busy: false, result: { type: 'error', msg: result.msg } });
    }
  };

  return (
    <div className="space-y-3 rounded-[14px] border border-cafe-border bg-cafe-surface-sunken/40 p-3">
      <div className="text-xs font-medium text-cafe-muted">外部 Agent Provider 路由审批 (F241)</div>
      {agentProviderRows.map((resource) => (
        <ApprovalRow
          key={resource.capId ?? `${resource.type}:${resource.name ?? ''}`}
          resource={resource}
          row={getRow(resource)}
          pluginId={plugin.id}
          onPatch={(patch) => resource.capId && updateRow(resource.capId, patch)}
          onApprove={() => void handleApprove(resource)}
        />
      ))}
    </div>
  );
}

/**
 * Single approval row — extracted to keep the parent under the Biome cognitive-
 * complexity budget. Owns no state; the parent threads `row` + `onPatch` so
 * `onUpdated()` re-renders cleanly when the binding refreshes.
 */
interface ApprovalRowProps {
  resource: PluginResourceStatus;
  row: ApprovalRowState;
  pluginId: string;
  onPatch: (patch: Partial<ApprovalRowState>) => void;
  onApprove: () => void;
}

function ApprovalRow({ resource, row, pluginId, onPatch, onApprove }: ApprovalRowProps) {
  const liveBinding = resource.agentProviderBinding;
  const isRouteable = resource.agentProviderRouteable === true;
  const showForm = !isRouteable || row.rebinding;
  const claims = resource.agentProviderClaims;
  return (
    <div className="space-y-2 rounded-[12px] border border-cafe-border bg-cafe-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" style={{ fontSize: 'var(--console-font-compact)', color: 'var(--cafe-text)' }}>
          {claims?.displayName ?? resource.name ?? 'agentProvider'}
        </span>
        <StateChip resource={resource} />
        {resource.agentProviderHealthFailureReason && (
          <span className="rounded-[13px] bg-conn-red-bg px-2.5 py-0.5 text-label font-medium text-conn-red-text">
            探针失败: {resource.agentProviderHealthFailureReason}
          </span>
        )}
        {/* F241 PR #42 round-1 review @codex P2: surface persisted sync failure
            separately from health probe failure so operators see WHY a row is
            `approved=true / healthy / routeable=false` after a Step 6 sync hook
            throws. Distinct chip + label keeps the two failure sources
            operator-distinguishable; the title attribute shows the occurredAt
            timestamp on hover so operators can correlate with logs. */}
        {resource.agentProviderLastSyncError && (
          <span
            className="rounded-[13px] bg-conn-red-bg px-2.5 py-0.5 text-label font-medium text-conn-red-text"
            title={new Date(resource.agentProviderLastSyncError.occurredAt).toLocaleString()}
            data-testid={`sync-error-${resource.capId}`}
          >
            同步失败: {resource.agentProviderLastSyncError.message}
          </span>
        )}
      </div>

      {isRouteable && liveBinding && (
        <BindingSummary
          binding={liveBinding}
          rebinding={row.rebinding}
          onRebind={() => onPatch({ rebinding: true, result: null })}
        />
      )}

      {showForm && (
        <ApprovalForm
          resource={resource}
          row={row}
          pluginId={pluginId}
          claims={claims}
          onPatch={onPatch}
          onApprove={onApprove}
        />
      )}

      {row.result && (
        <div
          className={`rounded-[12px] px-3 py-2 text-xs ${
            row.result.type === 'success'
              ? 'border border-conn-emerald-ring bg-conn-emerald-bg text-conn-emerald-text'
              : 'border border-conn-red-ring bg-conn-red-bg text-conn-red-text'
          }`}
          data-testid={`approve-result-${resource.capId}`}
        >
          {row.result.msg}
        </div>
      )}

      {resource.agentProviderDescriptorHash && (
        <div className="text-[10px] text-cafe-muted/70">
          descriptorHash: <code>{resource.agentProviderDescriptorHash.slice(0, 12)}…</code>
        </div>
      )}
    </div>
  );
}

function BindingSummary({
  binding,
  rebinding,
  onRebind,
}: {
  binding: NonNullable<PluginResourceStatus['agentProviderBinding']>;
  rebinding: boolean;
  onRebind: () => void;
}) {
  return (
    <div className="space-y-1 text-xs text-cafe-muted">
      <div>
        当前绑定 · <code className="rounded bg-cafe-surface-sunken px-1.5 py-0.5 text-cafe-text">@{binding.catId}</code>
      </div>
      {binding.mentionPatterns && binding.mentionPatterns.length > 0 && (
        <div>mention: {binding.mentionPatterns.join(', ')}</div>
      )}
      {!rebinding && (
        <button
          type="button"
          onClick={onRebind}
          className="console-inline-link"
          style={{ fontSize: 'var(--console-font-compact)' }}
        >
          重新绑定
        </button>
      )}
    </div>
  );
}

interface ApprovalFormProps {
  resource: PluginResourceStatus;
  row: ApprovalRowState;
  pluginId: string;
  claims: PluginResourceStatus['agentProviderClaims'];
  onPatch: (patch: Partial<ApprovalRowState>) => void;
  onApprove: () => void;
}

function ApprovalForm({ resource, row, pluginId, claims, onPatch, onApprove }: ApprovalFormProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-cafe-muted">
        catId
        <input
          type="text"
          value={row.catId}
          onChange={(e) => onPatch({ catId: e.target.value })}
          placeholder={defaultCatIdFromResource(resource, pluginId)}
          className="mt-1 w-full rounded-[10px] border border-cafe-border bg-cafe-surface px-2 py-1.5 text-xs text-cafe-text"
          data-testid={`approve-catId-${resource.capId}`}
        />
      </label>
      <label className="block text-xs text-cafe-muted">
        mention patterns (逗号或空格分隔，每个以 @ 开头)
        <input
          type="text"
          value={row.mentionPatternsText}
          onChange={(e) => onPatch({ mentionPatternsText: e.target.value })}
          placeholder={joinMentionPatterns(claims?.mentionPatterns) || '@clowder, @clowder-code'}
          className="mt-1 w-full rounded-[10px] border border-cafe-border bg-cafe-surface px-2 py-1.5 text-xs text-cafe-text"
          data-testid={`approve-mentionPatterns-${resource.capId}`}
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        {row.rebinding && (
          <button
            type="button"
            onClick={() => onPatch({ rebinding: false, result: null })}
            disabled={row.busy}
            className="console-button-secondary disabled:opacity-50"
            style={{ fontSize: 'var(--console-font-compact)' }}
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={onApprove}
          disabled={row.busy}
          className="console-button-primary disabled:opacity-50"
          style={{ fontSize: 'var(--console-font-compact)' }}
          data-testid={`approve-submit-${resource.capId}`}
        >
          {row.busy ? '审批中...' : '审批为可路由'}
        </button>
      </div>
    </div>
  );
}
