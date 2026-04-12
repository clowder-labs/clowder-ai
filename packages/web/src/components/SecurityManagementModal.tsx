'use client';

import { useState } from 'react';
import { AppModal } from './AppModal';

export interface SecurityManagementModalProps {
  open: boolean;
  onClose: () => void;
}

interface SecurityPolicyItem {
  id: string;
  action: string;
  approvalRequired: boolean;
}

// mock
const INITIAL_POLICIES: SecurityPolicyItem[] = [
  { id: 'policy-1', action: 'write_file', approvalRequired: false },
  { id: 'policy-2', action: 'mcp_exec_command', approvalRequired: false },
  { id: 'policy-3', action: 'mcp_exec_command', approvalRequired: true },
  { id: 'policy-4', action: 'write_file', approvalRequired: true },
  { id: 'policy-5', action: 'write_file', approvalRequired: false },
  { id: 'policy-6', action: 'write_file', approvalRequired: false },
  { id: 'policy-7', action: 'write_file', approvalRequired: false },
];

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
  testId?: string;
}

function ToggleSwitch({ checked, onToggle, ariaLabel, testId }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={onToggle}
      className={[
        'relative inline-flex h-[22px] w-8 shrink-0 items-center rounded-full transition-colors duration-200',
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

export default function SecurityManagementModal({ open, onClose }: SecurityManagementModalProps) {
  const [approvalBarEnabled, setApprovalBarEnabled] = useState(true);
  const [policies, setPolicies] = useState(INITIAL_POLICIES);

  const handleTogglePolicy = (id: string) => {
    setPolicies((current) =>
      current.map((policy) =>
        policy.id === id
          ? {
              ...policy,
              approvalRequired: !policy.approvalRequired,
            }
          : policy,
      ),
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
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4" data-testid="security-management-approval-header">
            <h4 className="text-[14px] font-semibold leading-6 text-[#111827]">是否开启审批护栏</h4>
            <ToggleSwitch
              checked={approvalBarEnabled}
              onToggle={() => setApprovalBarEnabled((current) => !current)}
              ariaLabel="是否开启审批护栏"
              testId="security-management-approval-bar-toggle"
            />
          </div>
          <p
            className="block w-full text-[12px] leading-6 text-[#808080]"
            data-testid="security-management-approval-description"
          >
            开启后，若对话中触发相关权限时按安全策略展示确认卡片；若关闭，则所有敏感操作无需用户执行风险审批。
          </p>
        </section>

        {approvalBarEnabled ? (
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
                        onToggle={() => handleTogglePolicy(policy.id)}
                        ariaLabel={`${policy.action}执行前审批开关`}
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
