'use client';

import { useEffect, useState } from 'react';
import { JiuwenAgentWsClient } from '@/utils/jiuwen-agent-ws-client';
import { AppModal } from './AppModal';

export interface SecurityManagementModalProps {
  open: boolean;
  onClose: () => void;
}

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
        checked ? 'bg-[#2F7BFF]' : 'bg-[#D1D5DB]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
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

export default function SecurityManagementModal({ open, onClose }: SecurityManagementModalProps) {
  const [permissionsConfig, setPermissionsConfig] = useState<PermissionsConfig | null>(null);
  const [approvalBarEnabled, setApprovalBarEnabled] = useState(false);
  const [policies, setPolicies] = useState<SecurityPolicyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingApprovalBar, setSavingApprovalBar] = useState(false);
  const [savingPolicyIds, setSavingPolicyIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadPermissions() {
      setLoading(true);
      setLoadError(null);
      setSaveError(null);

      try {
        const client = new JiuwenAgentWsClient();
        const response = await client.configGet(['permissions']);
        const permissions = response.payload?.trees?.permissions as PermissionsConfig | undefined;
        const error = response.payload?.error;

        if (!response.ok || !permissions) {
          throw new Error(typeof error === 'string' ? error : 'Failed to load permissions config');
        }

        if (cancelled) return;

        setPermissionsConfig(permissions);
        setApprovalBarEnabled(Boolean(permissions.enabled));
        setPolicies(normalizePolicies(permissions));
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

  const handleToggleApprovalBar = async () => {
    if (savingApprovalBar) return;

    const previousEnabled = approvalBarEnabled;
    const nextEnabled = !previousEnabled;
    setApprovalBarEnabled(nextEnabled);
    setSaveError(null);
    setSavingApprovalBar(true);

    try {
      const client = new JiuwenAgentWsClient();
      const response = await client.configSet({
        permissions: {
          enabled: nextEnabled,
        },
      });
      const error = response.payload?.error;
      if (!response.ok) {
        throw new Error(typeof error === 'string' ? error : 'Failed to save permissions config');
      }
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

    const previousPolicies = policies;
    const previousConfig = permissionsConfig;
    const currentValue = permissionsConfig?.tools?.[id];
    const nextApprovalRequired = !previousPolicies.find((policy) => policy.id === id)?.approvalRequired;
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
      const client = new JiuwenAgentWsClient();
      const response = await client.configSet({
        permissions: {
          tools: {
            [id]: nextToolValue,
          },
        },
      });
      const error = response.payload?.error;
      if (!response.ok) {
        throw new Error(typeof error === 'string' ? error : 'Failed to save tool policy');
      }
    } catch (error) {
      setPolicies(previousPolicies);
      setPermissionsConfig(previousConfig);
      setSaveError(error instanceof Error ? error.message : 'Failed to save tool policy');
    } finally {
      setSavingPolicyIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
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
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4" data-testid="security-management-approval-header">
            <h4 className="text-[14px] font-semibold leading-6 text-[#111827]">是否开启审批护栏</h4>
            <ToggleSwitch
              checked={approvalBarEnabled}
              onToggle={() => void handleToggleApprovalBar()}
              ariaLabel="是否开启审批护栏"
              disabled={loading || savingApprovalBar}
              testId="security-management-approval-bar-toggle"
            />
          </div>
          <p
            className="block w-full text-[12px] leading-6 text-[#808080]"
            data-testid="security-management-approval-description"
          >
            开启后，若对话中触发相关权限时按安全策略展示确认卡片；若关闭，则所有敏感操作无需用户执行风险审批。
          </p>
          {loading ? (
            <p className="text-[12px] leading-5 text-[#6B7280]" data-testid="security-management-loading">
              正在同步 jiuwen 安全配置...
            </p>
          ) : null}
          {loadError ? (
            <p className="text-[12px] leading-5 text-[#DC2626]" data-testid="security-management-load-error">
              {loadError}
            </p>
          ) : null}
          {saveError ? (
            <p className="text-[12px] leading-5 text-[#DC2626]" data-testid="security-management-save-error">
              {saveError}
            </p>
          ) : null}
        </section>

        {approvalBarEnabled && policies.length > 0 ? (
          <section className="space-y-3" data-testid="security-management-policy-section">
            <h4 className="text-[14px] font-semibold leading-6 text-[#111827]">安全策略配置</h4>

            <div className="rounded-[12px] border border-[#EEF2F7]">
              <div className="grid grid-cols-[1.6fr_1.4fr] border-b border-[#EEF2F7] bg-[#F5F7FA] px-5 py-4 text-[13px] font-medium text-[#4B5563]">
                <div>敏感操作</div>
                <div>在对话中是否需要审批</div>
              </div>

              <div className="max-h-[360px] overflow-y-auto bg-white">
                {policies.map((policy) => (
                  <div
                    key={policy.id}
                    data-testid={`security-policy-row-${policy.id}`}
                    className="grid grid-cols-[1.6fr_1.4fr] items-center border-b border-[#F3F5F8] px-5 py-5 text-[14px] text-[#111827] last:border-b-0"
                  >
                    <div className="font-normal leading-5 text-[#1F2937]">{policy.action}</div>
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={policy.approvalRequired}
                        onToggle={() => void handleTogglePolicy(policy.id)}
                        ariaLabel={`${policy.action}执行前审批开关`}
                        disabled={Boolean(savingPolicyIds[policy.id])}
                        testId={`security-policy-toggle-${policy.id}`}
                      />
                      <span className="text-[14px] text-[#111827]">{policy.approvalRequired ? '是' : '否'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </AppModal>
  );
}
