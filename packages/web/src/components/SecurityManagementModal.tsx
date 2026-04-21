'use client';

import { useEffect, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { apiFetch } from '@/utils/api-client';
import { AppModal } from './AppModal';
import { CenteredLoadingState } from './shared/CenteredLoadingState';

export interface SecurityManagementModalProps {
  open: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 5;

type PermissionDecision = 'allow' | 'ask';

interface ToolPermissionRule {
  '*': PermissionDecision;
  patterns?: Record<string, PermissionDecision>;
}

interface PermissionsConfig {
  enabled?: boolean;
  tools?: Record<string, PermissionDecision | ToolPermissionRule>;
}

interface SecurityPolicyItem {
  id: string;
  action: string;
  approvalRequired: boolean;
}

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
}

function ToggleSwitch({ checked, onToggle, ariaLabel, disabled = false, testId }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      data-testid={testId}
      onClick={onToggle}
      className={[
        'relative inline-flex h-[22px] w-8 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-[var(--modal-switch-on)]' : 'bg-[var(--modal-switch-off)]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-[var(--modal-switch-thumb)] shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[14px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  );
}

function getToolDecision(value: PermissionDecision | ToolPermissionRule | undefined): PermissionDecision {
  if (!value) return 'allow';
  if (typeof value === 'string') return value;
  return value['*'] ?? 'allow';
}

function normalizePolicies(config?: PermissionsConfig): SecurityPolicyItem[] {
  const tools = config?.tools ?? {};
  return Object.entries(tools).map(([toolName, value]) => ({
    id: toolName,
    action: toolName,
    approvalRequired: getToolDecision(value) === 'ask',
  }));
}

function isPermissionsEnabled(config?: PermissionsConfig): boolean {
  return config?.enabled ?? true;
}

function updateToolValue(
  current: PermissionDecision | ToolPermissionRule | undefined,
  nextDecision: PermissionDecision,
): PermissionDecision | ToolPermissionRule {
  if (!current || typeof current === 'string') {
    return nextDecision;
  }

  return {
    ...current,
    '*': nextDecision,
  };
}

function formatPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    2,
    totalPages - 1,
    totalPages,
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index];
    const previous = sortedPages[index - 1];
    if (previous != null && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }

  return result;
}

export default function SecurityManagementModal({ open, onClose }: SecurityManagementModalProps) {
  const [permissionsConfig, setPermissionsConfig] = useState<PermissionsConfig | null>(null);
  const [approvalBarEnabled, setApprovalBarEnabled] = useState(false);
  const [policies, setPolicies] = useState<SecurityPolicyItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingApprovalBar, setSavingApprovalBar] = useState(false);
  const [savingPolicyIds, setSavingPolicyIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadPermissions() {
      setLoading(true);
      setLoadError(null);
      setSaveError(null);

      try {
        const response = await apiFetch('/api/config/relayclaw/security');
        const payload = (await response.json()) as { permissions?: PermissionsConfig; error?: string };
        const permissions = payload.permissions;
        if (!response.ok || !permissions) {
          throw new Error(payload.error || 'Failed to load permissions config');
        }

        if (cancelled) return;

        setPermissionsConfig(permissions);
        setApprovalBarEnabled(isPermissionsEnabled(permissions));
        setPolicies(normalizePolicies(permissions));
        setPage(1);
      } catch (error) {
        if (cancelled) return;

        setPermissionsConfig(null);
        setApprovalBarEnabled(false);
        setPolicies([]);
        setLoadError(error instanceof Error ? error.message : 'Failed to load permissions config');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEscapeKey({
    enabled: open,
    onEscape: onClose,
  });

  const handleToggleApprovalBar = async () => {
    if (savingApprovalBar) return;

    const previousEnabled = approvalBarEnabled;
    const nextEnabled = !previousEnabled;
    setApprovalBarEnabled(nextEnabled);
    setSaveError(null);
    setSavingApprovalBar(true);

    try {
      const response = await apiFetch('/api/config/relayclaw/security', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            enabled: nextEnabled,
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to save permissions config');

      setPermissionsConfig((current) => ({
        ...(current ?? {}),
        enabled: nextEnabled,
      }));
    } catch (error) {
      setApprovalBarEnabled(previousEnabled);
      setSaveError(error instanceof Error ? error.message : 'Failed to save permissions config');
    } finally {
      setSavingApprovalBar(false);
    }
  };

  const handleTogglePolicy = async (id: string) => {
    if (savingPolicyIds[id]) return;

    const currentPolicy = policies.find((policy) => policy.id === id);
    const previousApprovalRequired = currentPolicy?.approvalRequired ?? false;
    const currentValue = permissionsConfig?.tools?.[id];
    const nextApprovalRequired = !previousApprovalRequired;
    const nextDecision: PermissionDecision = nextApprovalRequired ? 'ask' : 'allow';
    const nextToolValue = updateToolValue(currentValue, nextDecision);

    setPolicies((current) =>
      current.map((policy) =>
        policy.id === id
          ? {
              ...policy,
              approvalRequired: nextApprovalRequired,
            }
          : policy,
      ),
    );
    setPermissionsConfig((current) => ({
      ...(current ?? {}),
      tools: {
        ...(current?.tools ?? {}),
        [id]: nextToolValue,
      },
    }));
    setSaveError(null);
    setSavingPolicyIds((current) => ({ ...current, [id]: true }));

    try {
      const response = await apiFetch('/api/config/relayclaw/security', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            tools: {
              [id]: nextToolValue,
            },
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save tool policy');
      }
    } catch (error) {
      setPolicies((current) =>
        current.map((policy) =>
          policy.id === id
            ? {
                ...policy,
                approvalRequired: previousApprovalRequired,
              }
            : policy,
        ),
      );
      setPermissionsConfig((current) => {
        const nextTools = { ...(current?.tools ?? {}) };
        if (currentValue === undefined) {
          delete nextTools[id];
        } else {
          nextTools[id] = currentValue;
        }

        return {
          ...(current ?? {}),
          tools: nextTools,
        };
      });
      setSaveError(error instanceof Error ? error.message : 'Failed to save tool policy');
    } finally {
      setSavingPolicyIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div
          className="flex min-h-[220px] flex-1 items-center justify-center"
          data-testid="security-management-loading"
        >
          <CenteredLoadingState />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4" data-testid="security-management-approval-header">
            <h4 className="text-[14px] font-semibold leading-6 text-[var(--modal-title-text)]">是否开启审批护栏</h4>
            <ToggleSwitch
              checked={approvalBarEnabled}
              onToggle={() => void handleToggleApprovalBar()}
              ariaLabel="是否开启审批护栏"
              disabled={savingApprovalBar}
              testId="security-management-approval-bar-toggle"
            />
          </div>
          <p
            className="block w-full text-[12px] leading-6 text-[var(--modal-text-muted)]"
            data-testid="security-management-approval-description"
          >
            开启后，若对话中触发相关权限时按安全策略展示确认卡片；若关闭，则所有敏感操作无需用户执行风险审批。
          </p>
          {loadError ? (
            <p className="text-[12px] leading-5 text-[var(--modal-danger-text)]" data-testid="security-management-load-error">
              {loadError}
            </p>
          ) : null}
          {saveError ? (
            <p className="text-[12px] leading-5 text-[var(--modal-danger-text)]" data-testid="security-management-save-error">
              {saveError}
            </p>
          ) : null}
        </section>

{approvalBarEnabled && policies.length > 0 ? (
          (() => {
            const totalPages = Math.max(1, Math.ceil(policies.length / PAGE_SIZE));
            const paginatedPolicies = policies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            const showPagination = policies.length > PAGE_SIZE;
            const paginationItems = showPagination ? formatPaginationPages(page, totalPages) : [];

            return (
              <section className="space-y-3" data-testid="security-management-policy-section">
                <h4 className="text-[14px] font-semibold leading-6 text-[var(--modal-title-text)]">安全策略配置</h4>

                <div className="rounded-[12px] border border-[var(--modal-muted-border)]">
                  <div className="grid grid-cols-[1.6fr_1.4fr] border-b border-[var(--modal-muted-border)] bg-[var(--modal-table-header-bg)] px-5 py-4 text-[13px] font-medium text-[var(--modal-text-muted)]">
                    <div>敏感操作</div>
                    <div>是否需要审批</div>
                  </div>

                  <div className="bg-[var(--modal-surface)]">
                    {paginatedPolicies.map((policy) => (
                      <div
                        key={policy.id}
                        data-testid={`security-policy-row-${policy.id}`}
                        className="grid grid-cols-[1.6fr_1.4fr] items-center border-b border-[var(--modal-table-divider)] px-5 py-5 text-[14px] text-[var(--modal-title-text)] last:border-b-0"
                      >
                        <div className="font-normal leading-5 text-[var(--modal-text)]">{policy.action}</div>
                        <div className="flex items-center gap-3">
                          <ToggleSwitch
                            checked={policy.approvalRequired}
                            onToggle={() => void handleTogglePolicy(policy.id)}
                            ariaLabel={`${policy.action} 执行前审批开关`}
                            disabled={Boolean(savingPolicyIds[policy.id])}
                            testId={`security-policy-toggle-${policy.id}`}
                          />
                          <span className="text-[14px] text-[var(--modal-title-text)]">{policy.approvalRequired ? '是' : '否'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {showPagination ? (
                  <div className="flex items-center justify-end gap-1" data-testid="security-management-pagination">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page <= 1}
                      aria-label="上一页"
                      data-testid="security-management-pagination-prev"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M11.5 5L6.5 10L11.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>

                    {paginationItems.map((item, index) =>
                      item === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-[14px] text-[var(--modal-text-subtle)]">
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[12px] ${
                            item === page
                              ? 'bg-[var(--modal-muted-surface)] text-[var(--modal-text)]'
                              : 'text-[var(--modal-text-muted)] hover:bg-[var(--modal-muted-surface)]'
                          }`}
                          onClick={() => setPage(item)}
                          data-testid={`security-management-pagination-page-${item}`}
                        >
                          {item}
                        </button>
                      ),
                    )}

                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={page >= totalPages}
                      aria-label="下一页"
                      data-testid="security-management-pagination-next"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M8.5 5L13.5 10L8.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })()
        ) : null}
      </div>
    );
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      disableBackdropClose
      title="安全管理"
      closeButtonAriaLabel="关闭安全管理弹窗"
      backdropTestId="security-management-modal-backdrop"
      panelTestId="security-management-modal"
      bodyTestId="security-management-modal-body"
      panelClassName="w-[700px] max-w-[calc(100vw-32px)]"
      headerClassName="p-0 pb-4"
      bodyClassName="flex flex-col"
    >
      {renderContent()}
    </AppModal>
  );
}
