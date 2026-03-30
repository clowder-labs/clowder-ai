'use client';

import { useState } from 'react';
import { TagEditor } from './hub-tag-editor';
import type { ProfileItem } from './hub-provider-profiles.types';

export function ProviderProfilesSummaryCard() {
  return (
    <div className="rounded-2xl border border-[#E6EAF2] bg-[#F8FAFD] p-4">
      <p className="text-[13px] font-semibold text-[#637188]">系统配置 &gt; 账号配置</p>
      <p className="mt-2 text-[13px] leading-6 text-[#7E8899]">每个账号可添加或删除模型。</p>
    </div>
  );
}

export type ApiProtocol = 'anthropic' | 'openai' | 'google';
export type AcpProviderKind = 'api_key' | 'acp';

const PROTOCOL_OPTIONS: Array<{ value: ApiProtocol; label: string }> = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];

export function CreateApiKeyProfileSection({
  kind,
  displayName,
  baseUrl,
  apiKey,
  protocol,
  models,
  command,
  args,
  cwd,
  envText,
  boundProviderRef,
  defaultModel,
  bindableProviders,
  protocolOptions = PROTOCOL_OPTIONS,
  busy,
  onKindChange,
  onDisplayNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  onProtocolChange,
  onModelsChange,
  onCommandChange,
  onArgsChange,
  onCwdChange,
  onEnvTextChange,
  onBoundProviderRefChange,
  onDefaultModelChange,
  onCreate,
  defaultExpanded = false,
}: {
  kind: AcpProviderKind;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  protocol: ApiProtocol;
  models: string[];
  command: string;
  args: string;
  cwd: string;
  envText: string;
  boundProviderRef: string;
  defaultModel: string;
  bindableProviders: ProfileItem[];
  protocolOptions?: Array<{ value: ApiProtocol; label: string }>;
  busy: boolean;
  onKindChange: (kind: AcpProviderKind) => void;
  onDisplayNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onProtocolChange: (protocol: ApiProtocol) => void;
  onModelsChange: (models: string[]) => void;
  onCommandChange: (value: string) => void;
  onArgsChange: (value: string) => void;
  onCwdChange: (value: string) => void;
  onEnvTextChange: (value: string) => void;
  onBoundProviderRefChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onCreate: () => void;
  defaultExpanded?: boolean;
}) {
  const selectedBoundProvider = bindableProviders.find((profile) => profile.id === boundProviderRef) ?? null;
  const canCreate =
    kind === 'acp'
      ? displayName.trim().length > 0 &&
        command.trim().length > 0 &&
        ((!boundProviderRef.trim() && !defaultModel.trim()) || (boundProviderRef.trim().length > 0 && defaultModel.trim().length > 0))
      : displayName.trim().length > 0 &&
        baseUrl.trim().length > 0 &&
        apiKey.trim().length > 0 &&
        models.length > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h4 className="text-base font-semibold text-[#2E3440]">
          {kind === 'acp' ? '+ 新建 ACP Provider' : '+ 新建 API Key 账号'}
        </h4>
        <span className="text-sm text-[#8A93A2]">{expanded ? '▾ 收起' : '▸ 展开'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          <select
            value={kind}
            onChange={(e) => onKindChange(e.target.value as AcpProviderKind)}
            className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
          >
            <option value="api_key">API Key</option>
            <option value="acp">ACP</option>
          </select>
          <input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder={kind === 'acp' ? 'Provider 显示名，如 agent-teams-local' : '账号显示名，如 my-glm'}
            autoComplete="off"
            className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
          />
          {kind === 'acp' ? (
            <>
              <input
                value={command}
                onChange={(e) => onCommandChange(e.target.value)}
                placeholder="命令，如 uv"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <textarea
                value={args}
                onChange={(e) => onArgsChange(e.target.value)}
                rows={3}
                placeholder="参数按空格分隔，例如 --directory /opt/workspace/agent-teams run agent-teams gateway acp stdio"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <input
                value={cwd}
                onChange={(e) => onCwdChange(e.target.value)}
                placeholder="可选 cwd，例如 /opt/workspace/agent-teams"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <textarea
                value={envText}
                onChange={(e) => onEnvTextChange(e.target.value)}
                rows={3}
                placeholder="可选环境变量，每行 KEY=value"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <select
                value={boundProviderRef}
                onChange={(e) => onBoundProviderRefChange(e.target.value)}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
              >
                <option value="">不绑定上游 Provider，Agent 自管</option>
                {bindableProviders.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName}
                  </option>
                ))}
              </select>
              {selectedBoundProvider ? (
                <select
                  value={defaultModel}
                  onChange={(e) => onDefaultModelChange(e.target.value)}
                  className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
                >
                  <option value="">选择默认模型</option>
                  {(selectedBoundProvider.models ?? []).map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : (
            <>
              <select
                value={protocol}
                onChange={(e) => onProtocolChange(e.target.value as ApiProtocol)}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
              >
                {protocolOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder="API 服务地址，如 https://api.example.com/v1"
                autoComplete="off"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6E7785]">可用模型 *</p>
                <TagEditor
                  tags={models}
                  tone="purple"
                  addLabel="+ 添加模型"
                  placeholder="输入模型名，如 gpt-4o"
                  emptyLabel="(至少添加 1 个模型)"
                  onChange={onModelsChange}
                  minCount={0}
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onCreate}
            disabled={busy || !canCreate}
            className="rounded bg-[#111418] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A3038] disabled:opacity-50"
          >
            {busy ? '创建中...' : '创建'}
          </button>
        </div>
      )}
    </div>
  );
}
